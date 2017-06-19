import { DATA_PREFIX, QUERIES_PREFIX } from '../constants/state';

const filters = {
  parent: parent => item => {
    return (
      item &&
      filters.ancestor(parent)(item) &&
      item.id.replace(parent, '').split('.').length === 2
    );
  },

  ancestor: ancestor => item => {
    return ( 
      item &&
      item.id.indexOf(ancestor) === 0 &&
      item.id.replace(ancestor, '').indexOf('.') === 0
    );
  },

  type: expectedType => item => item && item.type === expectedType
}

export function selectPropByPath(path, obj) {
  let selector,
      numberSelector;

  if (typeof obj === 'undefined') {
    return obj;
  }

  if (typeof path === 'string') {
    return selectPropByPath(path.split('.'), obj);
  }

  selector = path[0];
  numberSelector = parseInt(selector);

  if (!isNaN(numberSelector)) {
    selector = numberSelector;
  }

  if (path.length === 0) {
    return obj;
  }

  return selectPropByPath(path.slice(1), obj[selector]);
}

export function selectDataFromState(uid, state) {
  let content = state[DATA_PREFIX],
      data;

  if (content) {
    data = content[uid];
  }

  return data;
}

export function uidsToResponse(uids, state) {
  let content = state[DATA_PREFIX];

  return {
    items: uids.map(uid => content[uid])
  };
}

export function findDataInState(query, state) {
  let content = state[DATA_PREFIX],
      uids = [];

  if (!content) {
    return { items: [] };
  }

  uids = Object.keys(query)
    .map(filterBy => filters[filterBy](query[filterBy]))
    .reduce(
      (uids, filter) => uids.filter(uid => filter(content[uid])),
      Object.keys(content)
    );

  return uidsToResponse(uids, state);
}

export function storeToObserver(store) {
  return {
    observe(...args) {
      let onChange = args.pop(),
          selector = args[0],
          lastState,
          getState,
          handleChange;

      getState = () => {
        return selector ? selectPropByPath(selector, store.getState()) : store.getState();
      }

      lastState = getState();
      handleChange = () => {
        let currentState = getState();
        if (currentState !== lastState) {
          let args = [ currentState, lastState ];
          lastState = currentState;
          onChange(...args);
        }
      }

      return {
        unobserve: store.subscribe(handleChange)
      };
    }
  }
}

export function matchesQuery(query = {}, content) {
  if (typeof content === 'undefined' || content === null) {
    return false;
  }

  return Object.keys(query)
    .map(filterBy => filters[filterBy](query[filterBy]))
    .every(filter => filter(content));
}

export function ensureActionMatches(expectedType) {
  return (action) => {
    return action.type === expectedType ? Promise.resolve(action) : Promise.reject(action);
  }
}

export function runDispatchAndExpect(dispatch, action, expectedType) {
  const isAction = (response) => typeof response.type !== 'undefined' && typeof response.response !== 'undefined';

  return dispatch(action)
    .then(ensureActionMatches(expectedType))
    .then(
      action => action.response,
      action => isAction(action) ? Promise.reject(action.response) : Promise.reject(action)
    );
}

export function dispatchThunkAndExpect(store, ...args) {
  return runDispatchAndExpect(store.dispatch, ...args);
}

/**
 * Deep clone's the given object recursively. Doesn't touch object's prototype,
 *  and only clones obejct, arrays and primitives.
 * @param  {Object} object Object should be JSON compatible
 * @return {Object}        Clone of given object
 */
export function clone(subject) {
  var cloned;

  if (typeof subject !== 'object' || !subject) {
    return subject;
  }

  if ('[object Array]' === Object.prototype.toString.apply(subject)) {
    return subject.map(clone);
  }

  cloned = {};
  for (let key in subject) {
    if (subject.hasOwnProperty(key)) {
      cloned[key] = clone(subject[key]);
    }
  }

  return cloned;
}

export function dataIsValid(data) {
  let whitelist = [ 'type', 'data' ],
      props = Object.keys(data || {});

  if (props.length === 0) {
    return false;
  }

  return props.every(prop => whitelist.indexOf(prop) !== -1);
}

export function toQueryParams(query = {}) {
  // Sort alphabetically, so that when caching it will always be the same key
  let alphabetically = (a, b) => a < b ? -1 : a > b ? 1 : 0;

  return Object.keys(query)
    .sort(alphabetically)
    .reduce((working, param) => {
      let value = query[param],
          prefix;

      if (!working) {
        prefix = '?';
      } else {
        prefix = `${working}&`;
      }

      return `${prefix}${param}=${encodeURIComponent(value)}`;
    }, '');
}

export function hasRunQuery(query, state) {
  const queryState = state[QUERIES_PREFIX],
        queryParams = toQueryParams(query);
  return !!(queryState && queryState[queryParams] && queryState[queryParams].queriedRemote);
}

export function makeBlankItem() {
  return {
    type: null,
    data: null
  };
}

export function makeItemWith(uid, item) {
  if (item === null) {
    return null
  };

  return Object.assign(clone(item), { id: uid });
}

export function pathToUid(path) {
  if (!path) {
    return path;
  }

  path = path.replace(/^\/+/, '').replace(/\/+$/, '');

  return path.split('/').join('.');
}

export function uidToPath(uid) {
  if (!uid) {
    return uid;
  }

  // Normalize so there's always a leading /
  if (uid.charAt(0) !== '.') {
    uid = `.${uid}`;
  }

  return uid.split('.').join('/');
}

export function itemUidToPath(item) {
  let path,
      transformed;

  if (!item) {
    return item;
  }

  path = uidToPath(item.id);
  transformed = Object.assign({}, item, { path });
  delete transformed.id;

  return transformed;
}

export function queryResultsToPath(results) {
  let items;

  if (!results) {
    return results;
  }

  items = results.items.map(itemUidToPath);

  return Object.assign({}, results, { items });
}

export function validatePath(path) {
  if (path.charAt(0) !== '/') {
    throw new Error(`Invalid path ${path}. Path must be a string starting with '/'`);
  }

  if (path.indexOf('//') !== -1) {
    throw new Error(`Invalid path '${path}'. Paths must not have more than one '/' in a row.`);
  }
}

export function jsonIsEqual(a, b) {
  let objectName = window.toString.call(a),
      isSameAsIn = other => (item, i) => jsonIsEqual(item, other[i]),
      hasSameIn = (a, b) => (key) => key in a && key in b && jsonIsEqual(a[key], b[key]),
      keysOfA;

  if (objectName !== toString.call(b)) {
    return false;
  }

  switch (objectName) {
  case '[object String]':
  case '[object Number]':
  case '[object Boolean]':
  case '[object Null]':
  case '[object Undefined]':
    return a === b;
  }

  if (Array.isArray(a)) {
    return a.length === b.length  && a.every(isSameAsIn(b));
  }

  // At this point we assume it's an object
  keysOfA = Object.keys(a);

  if (keysOfA.length !== Object.keys(b).length) {
    return false;
  }

  return keysOfA.every(hasSameIn(a, b));
}
