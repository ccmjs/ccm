/**
 * @overview
 * ES6 module that exports useful help functions for <i>ccmjs</i> component developers.
 * @author André Kless <andre.kless@web.de> 2019-2022
 * @license The MIT License (MIT)
 * @version 8.4.2
 * @changes
 * version 8.4.2 (29.11.2022):
 * - bugfix for formData(elem):obj - correct return of float values
 * version 8.4.1 (23.11.2022):
 * - bugfix for fillForm(elem,obj):void - correct changed checkbox state
 * version 8.4.0 (18.07.2022):
 * - updated progressBar(obj):void
 * version 8.3.0 (25.06.2022):
 * - added isEqual(obj,obj):boolean by m0xai (https://github.com/ccmjs/ccm/pull/8)
 * - added randomFromRange(obj,obj):number by m0xai (https://github.com/ccmjs/ccm/pull/7)
 * version 8.2.0 (28.04.2022):
 * - updated onFinish(obj,obj,obj):void - set 'unique' flag without 'user' flag for anonym result data
 * version 8.1.1 (30.03.2022):
 * - bugfix for fillForm(elem,obj):void - set no value on undefined instead of falsy
 * version 8.1.0 (23.02.2022):
 * - added appDependency(string):Array - converts the URL or the HTML embed code of an app to an app dependency
 * version 8.0.0 (07.01.2022):
 * - updated help functions for app handover
 * (for older version changes see helper-7.10.0.mjs)
 */

/**
 * (the namespaces are only used for categorization)
 * @namespace ModuleHelper
 */

/*--------------------------------------------- Backwards Compatibility ----------------------------------------------*/

/**
 * help functions for backwards compatibility
 * @namespace ModuleHelper.BackwardsCompatibility
 */

/**
 * used <i>ccmjs</i> version by the help functions of this module (default: latest version that is loaded within the webpage so far)
 * @type {Object}
 * @private
 */
let ccm = window.ccm;

/**
 * sets the _ccmjs_ version used by the help functions of this module
 * @function
 * @param {Object} version - <i>ccmjs</i> version
 * @memberOf ModuleHelper.BackwardsCompatibility
 */
export const use = version => ccm = version;

/*--------------------------------------------------- Action Data ----------------------------------------------------*/

/**
 * help functions for handling action data (predefined function calls)
 * @namespace ModuleHelper.ActionData
 */

/**
 * executes action data
 * @function
 * @async
 * @param {Array} action - action data
 * @param {Object} [context] - context for <code>this</code>
 * @returns {Promise<*>} return value of executed action data
 * @example action( [ functionName, 'param1', 'param2' ] )
 * @example action( [ 'functionName', 'param1', 'param2' ] )
 * @example action( [ 'this.functionName', 'param1', 'param2' ], context )
 * @example action( [ function () { console.log( this ); } ], context )
 * @example action( [ 'my.namespace.functionName', 'param1', 'param2' ] )
 * @example action( [ [ 'ccm.load', 'moduleURL#functionName' ], 'param1', 'param2' ] )
 * @example action( [ functionName ] )  // without parameters
 * @example action( functionName )      // without array
 * @memberOf ModuleHelper.ActionData
 */
export const action = async ( action, context ) => {

  // action is no array? => convert to array
  if ( !Array.isArray( action ) ) action = [ action ];

  // support import of an external function
  action[ 0 ] = await ccm.helper.solveDependency( action[ 0 ] );

  // execute action data
  if ( typeof action[ 0 ] === 'function' )
    return action[ 0 ].apply( context, action.slice( 1 ) );
  else
    return executeByName( action[ 0 ], action.slice( 1 ), context );
};

/**
 * performs a function by function name
 * @function
 * @param {string} name - function name
 * @param {Array} [args] - function arguments
 * @param {Object} [context] - context for <code>this</code>
 * @returns {*} return value of performed function
 * @example action( [ 'functionName', 'param1', 'param2' ] )
 * @example action( [ 'this.functionName', 'param1', 'param2' ], context )
 * @example action( [ 'my.namespace.functionName', 'param1', 'param2' ] )
 * @memberOf ModuleHelper.ActionData
 */
export const executeByName = ( name, args, context ) => {
  const namespaces = name.split( '.' );
  let flag;
  if ( namespaces[ 0 ] === 'this' ) flag = !!namespaces.shift();
  let namespace = flag ? context : window;
  name = namespaces.pop();
  namespaces.forEach( value => namespace = namespace[ value ] );
  return namespace[ name ].apply( context, args );
};

/*--------------------------------------------- Asynchronous Programming ---------------------------------------------*/

/**
 * help functions for handling asynchronous programming
 * @namespace ModuleHelper.AsynchronousProgramming
 */

/**
 * workaround for an asynchronous foreach
 * @function
 * @async
 * @param {Array} array - array to be iterated
 * @param {Function} callback - asynchronous function that is called for each array value
 * @returns {Promise<void>}
 * @example
 * const waiting_times = [ 100, 200, 300 ];
 * await asyncForEach( waiting_times, async ( value, i, array ) => {
 *   await sleep( value );
 *   console.log( value, i, array );
 * } );
 * @memberOf ModuleHelper.AsynchronousProgramming
 */
export const asyncForEach = async ( array, callback ) => {
  for ( let i = 0; i < array.length; i++ )
    await callback( array[ i ], i, array );
};

/**
 * sleep for a given number of milliseconds
 * @function
 * @async
 * @param {number} time - sleep time in milliseconds
 * @returns {Promise<void>}
 * @example await sleep( 3000 );
 * @example sleep( 3000 ).then( () => {...} ) );
 * @memberOf ModuleHelper.AsynchronousProgramming
 */
export const sleep = time => new Promise( resolve => setTimeout( resolve, time ) );

/**
 * triggers a component-specific event
 * @param {Object} instance - component instance at which the event triggers
 * @param {string} event - event name
 * @param {Object} [data] - event data
 */
export const triggerEvent = ( instance, event, data = {} ) => {
  data.instance = instance.index;
  data.root = ccm.context.root( instance ).index;
  data.event = event;
  document.dispatchEvent( new CustomEvent( 'ccm-' + instance.component.name, { detail: data } ) );
};

/*----------------------------------------------------- Checker ------------------------------------------------------*/

/**
 * help functions for condition checks
 * @namespace ModuleHelper.Checker
 */

/**
 * checks if an instance has DOM contact
 * @function
 * @param {Object} instance - <i>ccmjs</i>-based instance
 * @returns {boolean}
 * @example
 * // <body><div id="app"></div></body>
 * const instance = await ccm.instance( component, { root: document.querySelector( '#app' ) } );
 * console.log( hasDomContact( instance ) ) );  // => true
 * @example
 * const instance = await ccm.instance( component, { root: document.createElement( 'div' ) } );
 * console.log( hasDomContact( instance ) ) );  // => false
 * @example
 * // <body><div id="app"></div></body>
 * const parent = await ccm.instance( component, { root: document.querySelector( '#app' ) } );
 * const instance = await ccm.instance( component, { parent: parent } );
 * parent.element.appendChild( instance.root );
 * console.log( hasDomContact( instance ) ) );  // => true
 * @example
 * // <body><div id="app"></div></body>
 * const parent = await ccm.instance( component, { root: document.querySelector( '#app' ) } );
 * const instance = await ccm.instance( component, { parent: parent } );
 * console.log( hasDomContact( instance ) ) );  // => false
 * @memberOf ModuleHelper.Checker
 */
export const hasDomContact = instance => document.contains( ccm.context.root( instance ).root ) && ( hasParentContact( instance ) || !instance.parent );

/**
 * checks if an instance has parent element contact
 * @function
 * @param {Object} instance - <i>ccmjs</i>-based instance
 * @returns {boolean}
 * @example
 * const parent = await ccm.instance( component );
 * const instance = await ccm.instance( component, { parent: parent } );
 * parent.element.appendChild( instance.root );
 * console.log( hasParentContact( instance ) ) );  // => true
 * @example
 * const parent = await ccm.instance( component );
 * const instance = await ccm.instance( component, { parent: parent } );
 * console.log( hasParentContact( instance ) ) );  // => false
 * @memberOf ModuleHelper.Checker
 */
export const hasParentContact = instance => instance.parent && instance.parent.element.contains( instance.root );

/**
 * Checks strictly if two items are equal.
 * Their types are also matter. e.g: isEqual(23, "23") // returns false.
 * @author m0xai (https://github.com/ccmjs/ccm/pull/8)
 * @param  {*} obj1 The first item to compare.
 * @param  {*} obj2 The second item to compare.
 * @return {Boolean} Returns true if they're equal in value.
 * @memberOf ModuleHelper.Checker
 */
export const isEqual = (obj1, obj2) => {
  /**
   * Check/Get the exact type of given JavaScript object.
   * @param  {Object} item The given object, which type to find.
   * @return {String}     The given object's exact type.
   */
  function getType (item) {
    return Object.prototype.toString.call(item).slice(8, -1).toLowerCase(); // Gets the type of given item
  }
  function compareArrays () {
    // Check first the length of two items
    if (obj1.length !== obj2.length) return false;
    // Check each item in the array one by one
    for (let i = 0; i < obj1.length; i++) {
      if (!isEqual(obj1[i], obj2[i])) return false;
    }
    // If no errors occurs, return true
    return true;
  }

  function compareObjects() {
    // Check the length of two objects
    if (Object.keys(obj1).length !== Object.keys(obj2).length) return false;
    // Check each item in the object one by one
    for (let key in obj1) {
      if (Object.prototype.hasOwnProperty.call(obj1, key)) {
        if (!isEqual(obj1[key], obj2[key])) return false;
      }
    }
    // If no errors occurs, return true
    return true;
  }

  // Compare functions from their representing objects
  function compareFunctions () {
    return obj1.toString() === obj2.toString();
  }

  // Compare basic primitive type of elements
  function comparePrimitives() {
    return obj1 === obj2;
  }

  // Get the type of first argument
  let type = getType(obj1);

  // If the two items are not the same type, return false
  if (type !== getType(obj2)) return false;

  // Compare the two items based on their type
  if (type === 'array') return compareArrays();
  if (type === 'object') return compareObjects();
  if (type === 'function') return compareFunctions();
  return comparePrimitives();
};

/**
 * checks if current web browser is Firefox
 * @function
 * @returns {boolean}
 * @memberOf ModuleHelper.Checker
 */
export const isFirefox = () => navigator.userAgent.search( 'Firefox' ) > -1;

/**
 * checks if current web browser is Google Chrome
 * @function
 * @returns {boolean}
 * @memberOf ModuleHelper.Checker
 */
export const isGoogleChrome = () => /Chrome/.test( navigator.userAgent ) && /Google Inc/.test( navigator.vendor );

/**
 * checks if current web browser is Safari
 * @function
 * @returns {boolean}
 * @memberOf ModuleHelper.Checker
 */
export const isSafari = () => /^((?!chrome|android).)*safari/i.test( navigator.userAgent );

/*-------------------------------------------------- Data Handling ---------------------------------------------------*/

/**
 * help functions for data handling
 * @namespace ModuleHelper.DataHandling
 */

/**
 * converts an array of strings or numbers to an object of booleans or an array of datasets to an associative array
 * @function
 * @param {string[]|number[]} arr
 * @returns {Object.<string,boolean>}
 * @example console.log( arrToObj( [ 'foo', 'bar' ] ) );  // => { foo: true, bar: true }
 * @example console.log( arrToObj( [ 1, 2 ] ) );  // => { 1: true, 2: true }
 * @example console.log( arrToObj( [ { key: 'foo' }, { key: 'bar' } ] ) );  // => { foo: { key: 'foo' }, bar: { key: 'bar' } }
 * @memberOf ModuleHelper.DataHandling
 */
export const arrToObj = arr => {
  if ( !Array.isArray( arr ) ) return null;
  const result = {};
  arr.forEach( value => {
    if ( ccm.helper.isObject( value ) )
      result[ value.key ] = value;
    else
      result[ value ] = true
  } );
  return result;
};

/**
 * copies all properties from a source object to a target object with support of dot notation
 * @function
 * @param {Object} [target = {}]
 * @param {Object} [source = {}]
 * @returns {Object} modified target object
 * @example assign( { a: 'x', b: {}, c: [ 'm' ] }, { a: 'n', 'b.d': 'y', 'c.1': 'z' } )  // => { a: 'n', b: { d: 'y' }, c: [ 'm', 'z' ] }
 * @memberOf ModuleHelper.DataHandling
 */
export const assign = ( target = {}, source = {} ) => {
  source = ccm.helper.toDotNotation( source );
  for ( let key in source )
    ccm.helper.deepValue( target, key, source[ key ] );
  return target;
};

/**
 * cleans a string from HTML tags
 * @param string
 * @returns {string}
 */
export function cleanHTML( string ) {
  const div = document.createElement("div");
  div.innerHTML = string;
  return div.textContent;
}

/**
 * cleans an object/array from falsy values
 * @function
 * @param {Object|Array} obj
 * @param {boolean} [deep] - deep clean (recursive)
 * @returns {Object|Array} cleaned object/array
 * @example cleanObject( [ 'foo', false, 0, '', null, undefined, [], {} ] )  // => [ 'foo', [], {} ]
 * @memberOf ModuleHelper.DataHandling
 */
export const cleanObject = ( obj, deep ) => {

  if ( Array.isArray( obj ) ) {
    for ( let i = obj.length - 1; i >= 0; i-- )
      if ( !obj[ i ] )
        obj.splice( i, 1 );
      else if ( deep && typeof obj[ i ] === 'object' && !ccm.helper.isSpecialObject( obj[ i ] ) )
        cleanObject( obj[ i ] );
  }
  else
    for ( const key in obj )
      if ( obj.hasOwnProperty( key ) )
        if ( !obj[ key ] )
          delete obj[ key ];
        else if ( deep && typeof obj[ key ] === 'object' && !ccm.helper.isSpecialObject( obj[ key ] ) )
          cleanObject( obj[ key ] );

  return obj;
};

/**
 * @summary decodes with encodeJSON() encoded JSON
 * @description
 * All <code>%'%</code> are replaced with <code>"</code>.<br>
 * Returns passed parameter if decoding fails.
 * @function
 * @param {string} str - encoded JSON
 * @returns {Object|Array|string} decoded JSON
 * @example decodeJSON( "{%'%log%'%:true,%'%restart%'%:true}" )       // => { log: true, restart: true }
 * @example decodeJSON( "[%'%ccm.instance%'%,%'%./ccm.user.js%'%]" )  // => [ "ccm.instance", "./ccm.user.js" ]
 * @memberOf ModuleHelper.DataHandling
 */
export const decodeJSON = str => {
  if ( typeof str !== 'string' || !ccm.helper.regex( 'json' ).test( str ) ) return null;
  return ccm.helper.parse( str.replace( /%'%/g, '"' ) );
};

/**
 * @summary encodes JSON as string so that it can be set as value for input elements
 * @description
 * All <code>"</code> are replaced with <code>%'%</code>.<br>
 * Returns passed parameter if encoding fails.
 * @function
 * @param {Object|Array} json - JSON
 * @returns {string} encoded JSON
 * @example encodeJSON( { log: true, restart: true } )         // => "{%'%log%'%:true,%'%restart%'%:true}"
 * @example encodeJSON( [ 'ccm.instance', './ccm.user.js' ] )  // => "[%'%ccm.instance%'%,%'%./ccm.user.js%'%]"
 * @memberOf ModuleHelper.DataHandling
 */
export const encodeJSON = json => {
  if ( typeof json !== 'object' ) return '';
  return ccm.helper.stringify( json ).replace( /"/g, "%'%" );
};

/**
 * escapes HTML characters of a string value
 * @function
 * @param {string} value - string value
 * @returns {string}
 * @example escapeHTML( 'Hello <b>World</b>!' )  // => 'Hello &lt;b&gt;World&lt;/b&gt;!'
 * @memberOf ModuleHelper.DataHandling
 */
export const escapeHTML = value => {
  const text = document.createTextNode( value );
  const div = document.createElement( 'div' );
  div.appendChild( text );
  return div.innerHTML;
};

/**
 * filters a specific subset of complex data
 * @function
 * @param {Object} data - complex data
 * @param {Object} [mask] - defines specific subset
 * @returns {Object} subset of complex data
 * @example filterData( { a: 'x', b: 'y', c: 'c' }, { a: true, b: true } )  // => { a: 'x', b: 'y' }
 * @example filterData( { a: [ 1, 2, 3 ] }, { 'a.1': true, 'a.2': true } )  // => { a: [ null, 2, 3 ] }
 * @example filterData( { a: [ 1, 2, 3 ] }, { a: true, 'a.2': false } )  // => { a: [ 1, 2, '' ] }
 * @example filterData( { a: { x: 1, y: 2, z: 3 } }, { 'a.x': true, 'a.y': true } )  // => { a: { x: 1, y: 2 } }
 * @memberOf ModuleHelper.DataHandling
 */
export const filterData = ( data, mask ) => {
  if ( !mask ) return ccm.helper.clone( data );
  data = ccm.helper.toDotNotation( data, true );
  mask = ccm.helper.toDotNotation( mask );
  const result = {};
  for ( const key in mask )
    ccm.helper.deepValue( result, key, mask[ key ] ? data[ key ] : '' );
  return result;
};

/**
 * filters properties from an object
 * @function
 * @param {Object} obj - object
 * @param {...string} [keys] - properties
 * @return {Object} object that contains only filtered properties
 * @example filterProperties( { a: 'x', b: 'y', c: 'z' }, 'a', 'b' )  // => { a: 'x', b: 'y' }
 * @memberOf ModuleHelper.DataHandling
 */
export const filterProperties = ( obj, ...keys ) => {
  const result = {};
  keys.forEach( key => {
    if ( obj[ key ] !== undefined )
      result[ key ] = obj[ key ];
  } );
  return result;
};

/**
 * sets and/or deletes parameters in the URL and returns all parameter values in the URL
 * @function
 * @param {Object} [values] - key/values that are to be set and/or deleted in the URL
 * @param {boolean} [push] - push or replace the state in the browser history
 * @param {boolean} [reset] - discards all previously existing parameters
 * @returns {Object} key/values of all parameters in the URL
 * @example
 * // URL: http://www.example.de?abc=xyz&name=john
 * params( { abc: '', name: 'jane', foo: 'bar' } )
 * // => { name: 'jane', foo: 'bar' }
 * // URL: http://www.example.de?name=jane&foo=bar
 * @memberOf ModuleHelper.DataHandling
 */
export const params = ( values = {}, push, reset ) => {
  const searchParams = new URLSearchParams( reset ? '' : window.location.search );
  for ( const key in values )
    values[ key ] ? searchParams.set( key, values[ key ] ) : searchParams.delete( key );
  Object.keys( values ).length && window.history[ ( push ? 'push' : 'replace' ) + 'State' ]( '', '', '?' + searchParams.toString().replaceAll( '+', '%20' ) );
  return window.location.search.slice( 1 ).split( '&' ).reduce( ( acc, s ) => {
    const [ k, v ] = s.split( '=' );
    return Object.assign( acc, { [ k ]: decodeURIComponent( v ) } );
  }, {} );
}

/**
 * Creates a random number from the given minimum and maximum number arguments.
 * This function works also with negative numbers
 * @author m0xai (https://github.com/ccmjs/ccm/pull/7)
 * @param {Number} min Some number, which represents the minimum limit of the range
 * @param {Number} max Some number, which represents the maximum limit of the range
 * @returns {Number}
 * @memberOf ModuleHelper.DataHandling
 */
const randomFromRange = (min, max) => {
  if(isNaN(min)) throw new Error("Your min value " + min + " is actually not a number!" )
  if(isNaN(max)) throw new Error("Your max value " + max + " is actually not a number!" )

  // Find the difference between two numbers
  if(max <= min) {
    throw new Error("Your minimum number(" + min + ") is great than or equal to your maximum number (" + max + ").")
  } else {
    const differ = max - min; // Find the difference between numbers
    const random = Math.floor(Math.random() * differ); // Create the random number from difference and Math library, and then floor their multiply.

    return min + random; // Add random number to the minimum, in order to create a random number from the range.
  }
};

/**
 * renames the property name of an object
 * @function
 * @param {Object} obj - the object that contains the property
 * @param {string} before - old property name
 * @param {string} after - new property name
 * @example
 * const obj = { foo: 4711 };
 * renameProperty( obj, 'foo', 'bar' );
 * console.log( obj );  // => { "bar": 4711 }
 * @memberOf ModuleHelper.DataHandling
 */
export const renameProperty = ( obj, before, after ) => {
  obj[ after ] = obj[ before ];
  delete obj[ before ];
  if ( obj[ after ] === undefined ) delete obj[ after ];
};

/**
 * shuffles an array in-place with the Fisher-Yates algorithm
 * @see https://stackoverflow.com/a/6274381
 * @function
 * @param {Array} array
 * @example
 * const array = [ 1, 2, 3 ];
 * shuffleArray( array );
 * console.log( array );
 * @memberOf ModuleHelper.DataHandling
 */
export const shuffleArray = array => {
  for ( let i = array.length - 1; i > 0; i-- ) {
    const j = Math.floor( Math.random() * ( i + 1 ) );
    [ array[ i ], array[ j ] ] = [ array[ j ], array[ i ] ];
  }
  return array;
};

/**
 * converts a string to a valid dataset key
 * @function
 * @param {string} str - string
 * @returns {string} valid dataset key
 * @memberOf ModuleHelper.DataHandling
 */
export const toKey = str => str.trim().replace( /\W/g, '' );

/**
 * unescapes HTML characters of a string value
 * @function
 * @param {string} value - string value
 * @returns {string}
 * @example escapeHTML( 'Hello &lt;b&gt;World&lt;/b&gt;!' )  // => 'Hello <b>World</b>!'
 * @memberOf ModuleHelper.DataHandling
 */
export const unescapeHTML = value => {
  const element = document.createElement( 'div' );
  return value.replace( /\&[#0-9a-z]+;/gi, str => {
    element.innerHTML = str;
    return element.innerText;
  } );
};

/**
 * converts a XML document to JSON, attributes of XML elements are ignored
 * @function
 * @param {XMLDocument} xml
 * @returns {Object} JSON
 * @memberOf ModuleHelper.DataHandling
 */
export const xml2json = xml => {
  const json = {};
  recursive( json, xml.firstElementChild );
  return json;
  function recursive( obj, elem ) {
    if ( elem.childElementCount ) {
      obj[ elem.tagName ] = {};
      Array.from( elem.children ).forEach( child => recursive( obj[ elem.tagName ], child ) );
    }
    else
      obj[ elem.tagName ] = elem.innerHTML;
  }
};

/*-------------------------------------------------- Data Workflow ---------------------------------------------------*/

/**
 * help functions for data workflow handling
 * @namespace ModuleHelper.DataWorkflow
 */

/**
 * @summary gets a dataset from a datastore via given settings
 * @description
 * The original settings given are not changed (they are cloned).<br>
 * If the settings do not contain a dataset key, a unique key is generated.<br>
 * If the dataset does not exist in the datastore, an empty dataset is returned. This dataset is not newly created in the datastore and is only returned locally.<br>
 * Instead of the settings, a dataset can be given directly. This dataset is then returned as result.<br>
 * If the dataset key is specified in the settings directly as the dataset, this dataset is returned as the result.<br>
 * An instance for user authentication that can be reached from the datastore is automatically detected.
 * @function
 * @async
 * @param {Object} [settings={}] - contains the required data to determine the dataset (or is directly the dataset)
 * @param {Object} settings.store - the datastore that contains the dataset
 * @param {*} [settings.key] - the key of the dataset in the datastore (or initial dataset)
 * @param {boolean} [settings.login] - The user must log in if he is not already logged in to receive the dataset (only if an instance for user authentication could be determined automatically).
 * @param {boolean} [settings.user] - The dataset key given in the settings is expanded to a user-specific key: <code>[ dataset_key, user_key ]</code> (only if user is detected and logged in)
 * @param {Object} [settings.permissions] - If the dataset does not exist, the empty dataset then returned will contain these permission settings.
 * @param {Function} [settings.convert] - With this function, the data contained in the result dataset can be adjusted.
 * @returns {Promise<Object>}
 * @throws {Error} if user must log in and login is canceled
 * @example
 * // load dataset by datastore and key
 * const dataset = await dataset( { store: datastore, key: dataset_key } );
 * console.log( dataset );  // => { key: dataset_key, ... }
 * @example
 * // passed dataset is directly returned as the result
 * const dataset = await dataset( { key: dataset_key, ... } );
 * console.log( dataset );  // => { key: dataset_key, ... }
 * @example
 * // passed dataset as key is directly returned as the result
 * const dataset = await dataset( { store: datastore, key: { key: dataset_key, ... } } );
 * console.log( dataset );  // => { key: dataset_key, ... }
 * @example
 * // load of an user-specific dataset
 * const dataset = await dataset( {
 *   store: datastore,
 *   key: dataset_key,
 *   login: true,       // user must log in if not already logged in
 *   user: true         // dataset key and user key will be combined
 * } );
 * console.log( dataset );  // => { key: [ dataset_key, user_key ], ... }
 * @example
 * // get new empty dataset with generated key that contains only given permission settings
 * const dataset = await dataset( {
 *   store: datastore,
 *   permissions: { creator: 'john', realm: 'guest', access: 'creator' }
 * } );
 * console.log( dataset );  // => { key: generated_key, _: { creator: 'john', realm: 'guest', access: 'creator' } }
 * @example
 * // adaptation of the data structure of the loaded dataset using a convert function
 * const dataset = await dataset( {
 *   store: datastore,
 *   key: dataset_key,
 *   convert: dataset => { dataset.lang = dataset.lang.toUpperCase(); return dataset; }
 * } );
 * console.log( dataset );  // => { key: dataset_key, lang: 'EN', ... }
 * @memberOf ModuleHelper.DataWorkflow
 */
export const dataset = async ( settings = {} ) => {

  // no manipulation of original passed parameter (avoids unwanted side effects)
  settings = ccm.helper.clone( settings );

  // settings are dataset directly? => dataset is result
  if ( !ccm.helper.isDatastore( settings.store ) ) return ccm.helper.isObject( settings ) ? settings : {};

  // no dataset key? => generate a unique key
  if ( !settings.key ) settings.key = ccm.helper.generateKey();

  // key is initial data? => take it as result
  if ( ccm.helper.isDataset( settings.key ) ) return settings.convert ? await settings.convert( settings.key ) : settings.key;

  /**
   * nearest user instance in <i>ccm</i> context tree
   * @type {Object}
   */
  const user = ccm.context.find( settings.store, 'user' );

  // user exists and must be logged in? => login user (if not already logged in)
  user && settings.login && await user.login();

  // should a user-specific key be used? => make key user-specific
  if ( ccm.helper.isInstance( user ) && settings.user && user.isLoggedIn() ) settings.key = [ settings.key, user.data().key ];

  // get dataset from datastore
  let dataset = await settings.store.get( settings.key );

  // dataset not exists? => use empty dataset
  if ( !dataset ) {
    dataset = { key: settings.key };
    if ( settings.permissions ) dataset._ = settings.permissions;
  }

  // has converter? => convert dataset
  if ( settings.convert ) dataset = await settings.convert( dataset );

  return dataset;
};

/**
 * @summary allows a declarative way to perform common finish actions
 * @description
 * The original parameters given are not changed (they are cloned).<br>
 * If an instance is passed for <code>settings</code>, the finish actions defined via the <code>instance.onfinish</code> property are used.<br>
 * If a function is passed for <code>settings</code>, the function is called with the result data.<br>
 * If an instance is passed for <code>settings</code>, the result data are automatically determined via <code>instance.getValue()</code>. To do this, the instance must have a <code>getValue</code> method.<br>
 * If an instance is passed for <code>settings</code>, the nearest instance for user authentication is automatically determined.
 * @function
 * @async
 * @param {Object|Function} settings - declarative settings for usual finish actions (or 'onfinish' callback or finished instance)
 * @param {Object} [results] - result data of the finished instance
 * @param {Object} [user] - user instance for authentication and user data
 * @param {string} [settings.confirm] - show confirm box (no finish actions will be performed if user chooses abort)
 * @param {Function} [settings.condition] - no finish actions will be performed if this function returns a falsy value (result data and possibly the instance is passed as parameters)
 * @param {boolean} [settings.login] - user will be logged in if not already logged in (only works if an instance for user authentication could be determined)
 * @param {Function} [settings.convert] - for dynamic adjustment of the results data (result data is passed as parameter, must return adjusted result data)
 * @param {boolean} [settings.log] - log result data in the developer console of the web browser
 * @param {Object} [settings.clear] - clear webpage area of the finished instance
 * @param {Object|boolean} [settings.store] - use this to store the result data in a data store (use boolean true to apply the settings of <code>instance.data</code>")
 * @param {Object} settings.store.settings - datastore accessor configuration for a datastore (result data will be set in this datastore)
 * @param {*} [settings.store.key] - dataset key for result data in the datastore (default is generated key)
 * @param {boolean} [settings.store.user] - The dataset key is expanded to an user-specific key: <code>[ dataset_key, user_key ]</code> (only if instance for user authentication is detected and user is logged in)
 * @param {boolean} [settings.store.unique] - The dataset key is expanded with an generated unique hash: <code>[ dataset_key, user_key, unique_hash ]</code>
 * @param {Object} [settings.store.permissions] - If the dataset does not exist, the dataset then will created with these permission settings.
 * @param {string} [settings.alert] - show alert message
 * @param {boolean} [settings.restart] - restart finished instance
 * @param {{component: string, config: Object}|*} [settings.render] - render other content (<i>ccmjs</i>-based app or HTML content, as default the content is rendered in the root element of the instance)
 * @param {callback} [settings.callback] - additional finish callback which will be called after the other finish actions (result data and possibly the instance is passed as parameter)
 * @returns {Promise<void>}
 * @example
 * instance.onfinish = {
 *   confirm: 'Are you sure?',
 *   condition: ( results, instance ) => true,
 *   login: true,
 *   convert: json => json,
 *   log: true,
 *   clear: true,
 *   store: {
 *     settings: { name: 'store_name', url: 'path/to/server/interface.php' },
 *     key: 'dataset_key',
 *     user: true,
 *     unique: true,
 *     permissions: {
 *       creator: 'john',
 *       group: {
 *         john: true,
 *         jane: true
 *       },
 *       access: {
 *         get: 'all',
 *         set: 'group',
 *         del: 'creator'
 *       }
 *     }
 *   },
 *   alert: 'Finished!',
 *   restart: true,
 *   render: {
 *     component: 'component_url',
 *     config: {...}
 *   },
 *   callback: ( results, instance ) => console.log( results, instance )
 * };
 * onFinish( instance );
 * @example
 * instance.data = {
 *   store: { name: 'store_name', url: 'path/to/server/interface.php' }
 *   key: 'dataset_key',
 *   user: true,
 *   unique: true,
 *   permissions: {...}
 * };
 * instance.onfinish = {
 *   store: true
 * };
 * onFinish( instance );
 * @example
 * onFinish( { render: {
 *   component: 'component_url',
 *   config: {
 *     root: document.body,
 *     ...
 *   }
 * } } );
 * @example
 * instance.onfinish = { render: 'Hello <b>World</b>!' };
 * onFinish( instance );
 * @example
 * instance.onfinish = { render: { inner: 'Hello World!' } } };
 * onFinish( instance );
 * @memberOf ModuleHelper.DataWorkflow
 */
export const onFinish = async ( settings, results, user ) => {
  let instance;

  // no manipulation of original passed parameters (avoids unwanted side effects)
  settings = ccm.helper.clone( settings );
  results  = ccm.helper.clone( results  );

  // has ccm instance? => take finish actions from 'instance.onfinish' and result data from 'instance.getValue()'
  if ( ccm.helper.isInstance( settings ) ) {
    instance = settings;
    if ( !results && settings.getValue ) results = settings.getValue();  // determine result data
    settings = settings.onfinish;                                        // determine finish actions
    if ( !user ) user = ccm.context.find( instance, 'user' );            // determine nearest user instance in the ccm context of the instance
  }

  if ( !settings ) return;                                                     // no finish actions? => abort
  if ( typeof settings === 'function' ) return settings( results, instance );  // are the finish actions defined by function? => perform function with results

  if ( settings.confirm && !confirm( settings.confirm ) ) return;                          // confirm box
  if ( settings.condition && !( await settings.condition( results, instance ) ) ) return;  // check condition
  user && settings.login && await user.login();                                            // login user (if not already logged in)
  if ( settings.convert ) results = await settings.convert( results, instance );           // adjust result data
  settings.log && console.log( results );                                                  // log result data (if necessary)
  if ( instance && settings.clear ) instance.element.innerHTML = '';                       // clear website area of the instance (if necessary)

  // store result data in a datastore
  if ( settings.store && results ) {

    /**
     * deep copy of result data
     * @type {Object}
     */
    const dataset = ccm.helper.clone( results );

    // allow shortcut for update dataset in its original datastore
    if ( instance && settings.store === true ) {
      settings.store = {};
      if ( ccm.helper.isObject( instance.data ) && ccm.helper.isDatastore( instance.data.store ) ) {
        settings.store = ccm.helper.clone( instance.data );
        settings.store.settings = settings.store.store;
        delete settings.store.store;
      }
    }

    // prepare dataset key
    dataset.key = [ settings.store.key || ccm.helper.generateKey() ];  // use existing key or generate new unique key
    if ( settings.store.user && user && user.isLoggedIn() ) {          // is user specific result data and user is logged in?
      dataset.key.push( user.data().key );                             // expand key with user key
      if ( !dataset.user ) dataset.user = user.data().key;             // add user key to result data
    }
    settings.store.unique && dataset.key.push( ccm.helper.generateKey() );  // expand key with generated unique key
    if ( dataset.key.length === 1 )
      dataset.key = dataset.key[ 0 ];
    else if ( !dataset.app )
      dataset.app = dataset.key[ 0 ];

    if ( settings.store.permissions ) dataset._ = settings.store.permissions;          // prepare permission settings
    if ( user ) settings.store.settings.user = user;                                   // set user instance for datastore
    await ccm.store( settings.store.settings ).then( store => store.set( dataset ) );  // store result data in datastore

  }

  if ( settings.alert ) alert( settings.alert );           // alert message
  instance && settings.restart && await instance.start();  // restart ccm instance

  // render other content (ccm-based app or HTML content)
  if ( settings.render )
    if ( ccm.helper.isObject( settings.render ) && settings.render.component ) {

      const config = settings.render.config || {};                                            // determine instance configuration
      if ( !config.root && instance ) config.root = instance && instance.root.parentElement;  // set root element

      // set parent instance
      if ( !config.parent && config.parent !== false && instance && instance.parent )
        config.parent = instance.parent;

      await ccm.start( settings.render.component, config );  // render ccm-based app

    }
    else instance && setContent( instance.root, ccm.helper.html( settings.render ), ccm );  // render HTML content

  // perform additional finish callback
  settings.callback && await settings.callback( results, instance );

};

/*------------------------------------------------- DOM Manipulation -------------------------------------------------*/

/**
 * help functions for DOM Manipulation
 * @namespace ModuleHelper.DomManipulation
 */

/**
 * appends content to an HTML element (contained script tags will be removed)
 * @function
 * @param {Element} elem - HTML element
 * @param {...*} content
 * @example append( document.body, 'Hello World!' )
 * @example append( document.body, 'Hello', ' ', 'World', '!' )
 * @example append( document.body, [ 'Hello', ' ', 'World', '!' ] )
 * @example append( document.body, [ 'Hello', ' ', [ 'World', '!' ] ] )
 * @example append( document.body, { inner: 'Hello World!' } )
 * @example append( document.body, 'Hello', [ ' ', [ { inner: 'World' }, '!' ] ] )
 * @memberOf ModuleHelper.DomManipulation
 */
export const append = ( elem, ...content ) => {

  // append each content to the HTML element
  content.forEach( content => {

    // is array? => recursive call for each value
    if ( Array.isArray( content ) )
      return content.forEach( content => append( elem, content ) );

    // append content
    content = protect( ccm.helper.html( content ) );
    if ( typeof content === 'object' )
      elem.appendChild( content );
    else
      elem.insertAdjacentHTML( 'beforeend', content );

  } );

};

/**
 * prepends content to a HTML element (contained script tags will be removed)
 * @function
 * @param {Element} elem - HTML element
 * @param {...*} content
 * @example prepend( document.body, 'Hello World!' )
 * @example prepend( document.body, 'Hello', ' ', 'World', '!' )
 * @example prepend( document.body, [ 'Hello', ' ', 'World', '!' ] )
 * @example prepend( document.body, [ 'Hello', ' ', [ 'World', '!' ] ] )
 * @example prepend( document.body, { inner: 'Hello World!' } )
 * @example prepend( document.body, 'Hello', [ ' ', [ { inner: 'World' }, '!' ] ] )
 * @memberOf ModuleHelper.DomManipulation
 */
export const prepend = ( elem, ...content ) => {

  // prepend each content to the HTML element
  content.reverse().forEach( content => {

    // is array? => recursive call for each value
    if ( Array.isArray( content ) )
      return content.reverse().forEach( content => prepend( elem, content ) );

    // no child nodes? => append content
    if ( !elem.hasChildNodes() )
      return append( elem, content );

    // prepend content
    content = protect( ccm.helper.html( content ) );
    if ( typeof content === 'object' )
      elem.insertBefore( content, elem.firstChild );
    else
      elem.insertAdjacentHTML( 'afterbegin', content );

  } );

};

/**
 * removes an HTML element from its parent
 * @function
 * @param {Element} elem - HTML element
 * @example
 * const element = document.createElement( 'div' );
 * document.body.appendChild( element );
 * removeElement( element );
 * console.log( element.parentNode );  // => null
 * @memberOf ModuleHelper.DomManipulation
 */
export const remove = elem => elem && elem.parentNode && elem.parentNode.removeChild( elem );

/**
 * replaces an HTML element with an other HTML element (contained script tags will be removed)
 * @function
 * @param {Element} elem - HTML element (must have a parent)
 * @param {*} other - other HTML element
 * @example replace( document.querySelector( '#myid' ), '<b>World</b>' )
 * @example replace( document.querySelector( '#myid' ), { tag: 'b', inner: 'World' } )
 * @memberOf ModuleHelper.DomManipulation
 */
export const replace = ( elem, other ) => elem.parentNode && elem.parentNode.replaceChild( protect( ccm.helper.html( other ) ), elem );

/**
 * set the content of an HTML element (contained script tags will be removed)
 * @function
 * @param {Element} elem - HTML element
 * @param {...*} content - new content for the HTML element (old content is cleared)
 * @example setContent( document.body, 'Hello World!' )
 * @example setContent( document.body, 'Hello', ' ', 'World', '!' )
 * @example setContent( document.body, [ 'Hello', ' ', 'World', '!' ] )
 * @example setContent( document.body, [ 'Hello', ' ', [ 'World', '!' ] ] )
 * @example setContent( document.body, { inner: 'Hello World!' } )
 * @example setContent( document.body, 'Hello', [ ' ', [ { inner: 'World' }, '!' ] ] )
 * @memberOf ModuleHelper.DomManipulation
 */
export const setContent = ( elem, ...content ) => {
  elem.innerHTML = '';      // clear old content
  append( elem, content );  // append new content
};

/*----------------------------------------------- HTML Input Elements ------------------------------------------------*/

/**
 * helper functions for handling of HTML input elements
 * @namespace ModuleHelper.InputElements
 */

/**
 * fills input elements with values
 * @function
 * @param {Element} elem - HTML element which contains the input elements (must not be an HTML form tag)
 * @param {Object} data - contains the values for the input elements
 * @example
 * // <body><input type="text" name="user"><input type="password" name="secret"></body>
 * fillForm( document.body, { user: 'JohnDoe', secret: '1aA' } );
 * console.log( formData( document.body ) ); // { user: 'JohnDoe', secret: '1aA' }
 * @example
 * // <body><input type="checkbox" name="agreed"></body> (boolean checkbox)
 * fillForm( document.body, { agreed: true } );
 * console.log( formData( document.body ) ); // { agreed: true }
 * @example
 * // <body><input type="checkbox" name="role" value="Coordinator"></body> (value checkbox)
 * fillForm( document.body, { role: 'Coordinator' } );
 * console.log( formData( document.body ) ); // { role: 'Coordinator' }
 * @example
 * // <body><input type="checkbox" name="types" value="A"><input type="checkbox" name="types" value="B"></body> (multi checkbox)
 * fillForm( document.body, { types: [ 'A', 'B' ] } );
 * console.log( formData( document.body ) ); // { types: [ 'A', 'B' ] }
 * @example
 * // <body><input type="radio" name="choice" value="A"><input type="radio" name="choice" value="B"></body> (radio buttons)
 * fillForm( document.body, { choice: 'A' } );
 * console.log( formData( document.body ) ); // { choice: 'A' }
 * @example
 * // <body><select name="item"><option value="A">Item A</option><option value="B">Item B</option></select></body> (selector box)
 * fillForm( document.body, { item: 'A' } );
 * console.log( formData( document.body ) ); // { item: 'A' }
 * @example
 * // <body><select name="item"><option>A</option><option>B</option></select></body> (selector box without values)
 * fillForm( document.body, { item: 'A' } );
 * console.log( formData( document.body ) ); // { item: 'A' }
 * @example
 * // <body><select multiple name="items"><option value="A">Item A</option><option value="B">Item B</option></select></body> (multi-selector box)
 * fillForm( document.body, { items: [ 'A', 'B' ] } );
 * console.log( formData( document.body ) ); // { items: [ 'A', 'B' ] }
 * @example
 * // <body><textarea name="description"></description></body> (textarea)
 * fillForm( document.body, { description: 'Hello World!' } );
 * console.log( formData( document.body ) ); // { description: 'Hello World!' }
 * @example
 * // <body><div contenteditable name="topic"></div></body> (in-place editing with contenteditable)
 * fillForm( document.body, { topic: 'Hello World!' } );
 * console.log( formData( document.body ) ); // { topic: 'Hello World!' }
 * @example
 * // <body><input type="text" name="deep.property.key"></input></body> (deep property value)
 * fillForm( document.body, { 'deep.property.key': 'value' } );
 * console.log( formData( document.body ) ); // { deep: { property: { key: 'value' } } }
 * @example
 * // <body><input type="text" name="data"></input></body> (complex data value)
 * fillForm( document.body, { data: { number: [ 1, 2, { a: 3 } ], checked: true, value: 'Hello World!' } } );
 * console.log( formData( document.body ) ); // { data: { number: [ 1, 2, { a: 3 } ], checked: true, value: 'Hello World!' } }
 * @memberOf ModuleHelper.InputElements
 */
export const fillForm = ( elem, data ) => {

  data = ccm.helper.clone( data );
  const dot = ccm.helper.toDotNotation( data, true );
  for ( const key in dot ) data[ key ] = dot[ key ];
  for ( const key in data ) {
    if ( data[ key ] === undefined ) continue;
    if ( typeof data[ key ] === 'object' ) data[ key ] = encodeJSON( data[ key ], ccm );
    elem.querySelectorAll( '[name="' + key + '"]' ).forEach( input => {
      if ( input.type === 'checkbox' ) {
        if ( data[ key ] === input.value )
          input.checked = true;
        else if ( input.value && typeof data[ key ] === 'string' && data[ key ].charAt( 0 ) === '[' )
          decodeJSON( data[ key ], ccm ).forEach( value => { if ( value === input.value ) input.checked = true; } );
        else
          input.checked = !!data[ key ];
      }
      else if ( input.type === 'radio' ) {
        if ( data[ key ] === input.value )
          input.checked = true;
      }
      else if ( input.tagName.toLowerCase() === 'select' ) {
        if ( input.hasAttribute( 'multiple' ) )
          data[ key ] = decodeJSON( data[ key ], ccm );
        input.querySelectorAll( 'option' ).forEach( option => {
          if ( input.hasAttribute( 'multiple' ) )
            data[ key ].forEach( value => encodeJSON( value, ccm ) === ( option.value ? option.value : option.innerHTML.trim() ) && ( option.selected = true ) );
          else if ( data[ key ] === ( option.value ? option.value : option.innerHTML.trim() ) )
            option.selected = true;
        } );
      }
      else if ( input.value === undefined )
        input.innerHTML = protect( data[ key ], ccm );
      else
        input.value = data[ key ];
    } );
  }

};

/**
 * gets the values of input elements
 * @function
 * @param {Element} elem - HTML element which contains the input elements (must not be a HTML form tag)
 * @param {Object} [settings = {}] - optional additional settings
 * @param {boolean} [settings.enabled_only] - ignore values from disabled input elements
 * @returns {Object} values of the input elements
 * @example
 * // <body><input type="text" name="user"><input type="password" name="secret"></body>
 * fillForm( document.body, { user: 'JohnDoe', secret: '1aA' } );
 * console.log( formData( document.body ) ); // { user: 'JohnDoe', secret: '1aA' }
 * @example
 * // <body><input type="checkbox" name="agreed"></body> (boolean checkbox)
 * fillForm( document.body, { agreed: true } );
 * console.log( formData( document.body ) ); // { agreed: true }
 * @example
 * // <body><input type="checkbox" name="role" value="Coordinator"></body> (value checkbox)
 * fillForm( document.body, { role: 'Coordinator' } );
 * console.log( formData( document.body ) ); // { role: 'Coordinator' }
 * @example
 * // <body><input type="checkbox" name="types" value="A"><input type="checkbox" name="types" value="B"></body> (multi checkbox)
 * fillForm( document.body, { types: [ 'A', 'B' ] } );
 * console.log( formData( document.body ) ); // { types: [ 'A', 'B' ] }
 * @example
 * // <body><input type="radio" name="choice" value="A"><input type="radio" name="choice" value="B"></body> (radio buttons)
 * fillForm( document.body, { choice: 'A' } );
 * console.log( formData( document.body ) ); // { choice: 'A' }
 * @example
 * // <body><select name="item"><option value="A">Item A</option><option value="B">Item B</option></select></body> (selector box)
 * fillForm( document.body, { item: 'A' } );
 * console.log( formData( document.body ) ); // { item: 'A' }
 * @example
 * // <body><select name="item"><option>A</option><option>B</option></select></body> (selector box without values)
 * fillForm( document.body, { item: 'A' } );
 * console.log( formData( document.body ) ); // { item: 'A' }
 * @example
 * // <body><select multiple name="items"><option value="A">Item A</option><option value="B">Item B</option></select></body> (multi-selector box)
 * fillForm( document.body, { items: [ 'A', 'B' ] } );
 * console.log( formData( document.body ) ); // { items: [ 'A', 'B' ] }
 * @example
 * // <body><textarea name="description"></description></body> (textarea)
 * fillForm( document.body, { description: 'Hello World!' } );
 * console.log( formData( document.body ) ); // { description: 'Hello World!' }
 * @example
 * // <body><div contenteditable name="topic"></div></body> (in-place editing with contenteditable)
 * fillForm( document.body, { topic: 'Hello World!' } );
 * console.log( formData( document.body ) ); // { topic: 'Hello World!' }
 * @example
 * // <body><input type="text" name="deep.property.key"></input></body> (deep property value)
 * fillForm( document.body, { 'deep.property.key': 'value' } );
 * console.log( formData( document.body ) ); // { deep: { property: { key: 'value' } } }
 * @example
 * // <body><input type="text" name="data"></input></body> (complex data value)
 * fillForm( document.body, { data: { number: [ 1, 2, { a: 3 } ], checked: true, value: 'Hello World!' } } );
 * console.log( formData( document.body ) ); // { data: { number: [ 1, 2, { a: 3 } ], checked: true, value: 'Hello World!' } }
 * @example
 * // <body><input type="text" name="user"><input type="password" name="secret" disabled></body>
 * fillForm( document.body, { user: 'JohnDoe', secret: '1aA' } );
 * console.log( formData( document.body, { enabled_only: true } ) ); // { user: 'JohnDoe' }
 * @memberOf ModuleHelper.InputElements
 */
export const formData = ( elem, settings = {} ) => {
  const data = {};
  elem.querySelectorAll( '[name]' ).forEach( input => {
    if ( settings.enabled_only && input.disabled ) return;
    let name = input.getAttribute( 'name' );
    if ( input.type === 'checkbox' ) {
      const value = input.checked ? ( input.value === 'on' ? true : input.value ) : ( input.value === 'on' ? false : '' );
      const multi = [ ...elem.querySelectorAll( '[name="' + name + '"]' ) ].length > 1;
      if ( multi ) {
        if ( !data[ name ] ) data[ name ] = [];
        value && data[ name ].push( value );
      }
      else data[ name ] = value;
    }
    else if ( input.type === 'radio' )
      data[ name ] = input.checked ? input.value : ( data[ name ] ? data[ name ] : '' );
    else if ( input.tagName.toLowerCase() === 'select' ) {
      let result = [];
      if ( input.hasAttribute( 'multiple' ) )
        input.querySelectorAll( 'option' ).forEach( option => option.selected && result.push( option.value ? option.value : option.inner ) );
      else
        input.querySelectorAll( 'option' ).forEach( option => {
          if ( option.selected ) result = option.value ? option.value : option.inner;
        } );
      data[ name ] = result;
    }
    else if ( input.type === 'number' || input.type === 'range' ) {
      let value = parseFloat( input.value );
      if ( isNaN( value ) ) value = '';
      data[ name ] = value;
    }
    else if ( input.value !== undefined )
      data[ name ] = input.value;
    else
      data[ input.getAttribute( 'name' ) ] = input.innerHTML;
    try {
      if ( typeof data[ name ] === 'string' )
        if ( ccm.helper.regex( 'json' ).test( data[ name ] ) )
          data[ name ] = decodeJSON( data[ name ], ccm );
    } catch ( err ) {}
  } );
  return ccm.helper.solveDotNotation( data );
};

/*--------------------------------------------------- App Handover ---------------------------------------------------*/

/**
 * helper functions for an app handover
 * @namespace ModuleHelper.AppHandover
 */

/**
 * converts the URL or the HTML embed code of an app to an <i>ccmjs</i>-based app dependency
 * @function
 * @param {string} app - URL or HTML embed code of an app
 * @returns {Promise<Array>} <i>ccmjs</i>-based app dependency
 * @memberOf ModuleHelper.AppHandover
 */
export const appDependency = async app => {
  if ( ccm.helper.isDependency( app ) ) { app[ 0 ] = 'ccm.start'; return app; }
  if ( typeof app !== 'string' ) return null;

  // URL
  if ( app.startsWith( 'http' ) ) {

    // get parameters from URL
    const char = app.includes( '?' ) ? '?' : '#';
    const params = app.substr( app.indexOf( char ) + 1 ).split( '&' ).reduce( ( acc, str ) => {
      const [ key, value ] = str.split( '=' );
      return Object.assign( acc, { [ key ]: decodeURIComponent( value ) } );
    }, {} );

    // DMS v5
    if ( params.app ) {
      params.app = params.app.split( ',' );
      const component = await ccm.get( { name: 'dms2-components', url: 'https://ccm2.inf.h-brs.de' }, params.app[ 0 ] );
      return [ 'ccm.start', component.path, [ 'ccm.get', { name: 'dms2-configs', url: 'https://ccm2.inf.h-brs.de' }, params.app ] ];
    }

    // DMS Bootstrap 2020
    if ( params.id ) {
      const app_meta = await ccm.get( { name: 'dms-apps', url: 'https://ccm2.inf.h-brs.de' }, params.id );
      return [ 'ccm.start', app_meta.path, [ 'ccm.get', app_meta.source[ 0 ], app_meta.source[ 1 ] ] ];
    }

    // LearningApps Marketplace
    if ( params.key ) return [ 'ccm.start', params.component, [ 'ccm.get', { name: params.name, url: params.url }, params.key ] ];

    // DMS v4
    if ( params.component ) {
      const { store, key } = JSON.parse( params.config );
      return [ 'ccm.start', params.component, [ 'ccm.get', store, key ] ];
    }

  }

  // HTML embed code
  if ( app.startsWith( '<' ) ) {
    const html = ccm.helper.html( `<div>${ app }</div>`, undefined, { no_evaluation: true } );
    const component = html.firstChild.getAttribute( 'src' ) || html.firstChild.getAttribute( 'component' );
    const config = html.lastChild.getAttribute( 'src' ) || html.lastChild.getAttribute( 'key' );
    const result = [ 'ccm.start', component ];
    result.push( JSON.parse( config ) );
    return result;
  }

  return null;
};

/**
 * @summary returns the URL of a <i>ccmjs</i>-based app
 * @function
 * @param {string} url - URL of the webpage which shows the app
 * @param {string} component - URL of the component on which the app is based.
 * @param {Object|Array} [config={}] - app configuration (or dependency)
 * @returns {string}
 * @memberOf ModuleHelper.AppHandover
 */
export const appURL = ( url, component, config = {} ) => {
  if ( config.store && config.key ) config = [ 'ccm.get', ccm.helper.isDatastore( config.store ) ? config.store.source() : config.store, config.key ];
  if ( config.includes && config.includes( '.mjs#' ) ) config = [ 'ccm.load', config ];
  return `${ url }?component=${ encodeURIComponent( component ) }&config=${ encodeURIComponent( ccm.helper.stringify( config ) ) }`;
};

/**
 * returns the script for a bookmarklet that adds an <i>ccmjs</i>-based app in the website
 * @param {string} component - URL of the component on which the app is based.
 * @param {Object} [config={}] - app configuration (or dependency)
 * @returns {string} bookmarklet
 */
export const bookmarklet = ( component, config = {} ) => {
  if ( config.store && config.key ) config = [ 'ccm.get', ccm.helper.isDatastore( config.store ) ? config.store.source() : config.store, config.key ];
  if ( config.includes && config.includes( '.mjs#' ) ) config = [ 'ccm.load', config ];
  component = encodeURI( component );
  const index = encodeURI( ccm.helper.convertComponentURL( component ).index );
  config = encodeURI( ccm.helper.stringify( config ) );
  return `javascript:(function()%7Bvar%20u%3D%22${component}%22%2Ci%3D%22${index}%22%2Cc%3D'${config}'%2Ce%3Ddocument.createElement(%22script%22)%3Be.setAttribute(%22src%22%2Cu)%2Cdocument.head.appendChild(e)%2C(e%3Ddocument.createElement(%22ccm-%22%2Bi)).setAttribute(%22src%22%2Cc)%2Cdocument.body.appendChild(e)%7D)()`;
}

/**
 * decomposes a given app URL of a <i>ccmjs</i>-based app
 * @function
 * @param {string} app_url - URL of the app
 * @returns {{component:string,config:Object}}
 * @memberOf ModuleHelper.AppHandover
 */
export const decomposeAppURL = app_url => {
  const result = {};
  try { app_url = decodeURIComponent( app_url ); } catch ( e ) {}
  app_url.substr( app_url.indexOf( '?' ) + 1 ).split( '&' ).forEach( part => {
    part = part.split( '=' );
    result[ part[ 0 ] ] = part[ 1 ];
  } );
  if ( result.config )
    if ( result.config === '{}' ) delete result.config;
    else result.config = JSON.parse( result.config );
  return result;
};

/**
 * decomposes a given embed code of a <i>ccmjs</i>-based app
 * @function
 * @param {string} embed_code - embed code of the app
 * @returns {{component:string,config:Object}}
 * @memberOf ModuleHelper.AppHandover
 */
export const decomposeEmbedCode = embed_code => {
  embed_code = ccm.helper.html( `<div>${embed_code}</div>`, undefined, { no_evaluation: true } );
  const result = {
    component: embed_code.firstChild.getAttribute( 'src' ) || embed_code.firstChild.getAttribute( 'component' ),
    config: embed_code.lastChild.getAttribute( 'src' )
  };
  if ( result.config )
    if ( result.config === '{}' ) delete result.config;
    else result.config = JSON.parse( result.config );
  return result;
};

/**
 * provides a download of a <i>ccmjs</i>-based app as HTML file
 * @function
 * @param {string} embed_code - embed code (with included script tag) of the app
 * @param {string} [filename='app'] - filename without file extension
 * @param {string} [title='App'] - title of the webpage
 * @param {string} [template='https://ccmjs.github.io/akless-components/resources/templates/app.html'] - URL of the HTML template file
 * @returns {Promise<void>}
 * @memberOf ModuleHelper.AppHandover
 */
export const downloadApp = async ( embed_code, filename = 'app', title = 'App', template = 'https://ccmjs.github.io/akless-components/resources/templates/app.html' ) => {
  template = await fetch( template ).then( response => response.text() );
  template = template.replace( '__TITLE__', title ).replace( '__EMBED__', embed_code );
  download( `${ filename }.html`, template );
};

/**
 * @summary generates the HTML embed code of a <i>ccmjs</i>-based app
 * @function
 * @param {string} component - URL of the component on which the app is based.
 * @param {Object} [config={}] - app configuration (or dependency)
 * @param {boolean} [noscript] - embed code does not contain a script tag
 * @returns {string} generated embed code
 * @memberOf ModuleHelper.AppHandover
*/
export const embedCode = ( component, config = {}, noscript ) => {
  const index = ccm.helper.convertComponentURL( component ).index;
  if ( config.store && config.key ) config = [ 'ccm.get', ccm.helper.isDatastore( config.store ) ? config.store.source() : config.store, config.key ];
  if ( config.includes( '.mjs#' ) ) config = [ 'ccm.load', config ];
  if ( noscript )
    return `<ccm-app component='${component}' src='${ccm.helper.stringify(config)}'></ccm-app>`;
  else
    return `<script src='${component}'></script><ccm-${index} src='${ccm.helper.stringify(config)}'></ccm-${index}>`;
};

/**
 * provides a download of a <i>ccmjs</i>-based app as iBook Widget (ZIP file)
 * @function
 * @async
 * @param {string} embed_code - embed code (with included script tag) of the app
 * @param {string} [filename='app'] - filename without file extension
 * @param {string} [title='App'] - website title for the index.html
 * @param {string} [folder='app'] - name of the folder inside the iBook Widget
 * @param {string} [template='https://ccmjs.github.io/akless-components/resources/templates/app.html'] - URL of the HTML template
 * @param {string} [info_file='https://ccmjs.github.io/akless-components/resources/templates/ibook_widget/Info.plist'] - URL of the info file
 * @param {string} [image_file='https://ccmjs.github.io/akless-components/resources/templates/ibook_widget/Default.png'] - URL of the image file
 * @returns {Promise<void>}
 * @memberOf ModuleHelper.AppHandover
 */
export const iBookWidget = async ( embed_code, filename = 'app', title = 'App', folder='app',
                                   template = 'https://ccmjs.github.io/akless-components/resources/templates/app.html',
                                   info_file = 'https://ccmjs.github.io/akless-components/resources/templates/ibook_widget/Info.plist',
                                   image_file = 'https://ccmjs.github.io/akless-components/resources/templates/ibook_widget/Default.png'
) => {

  template = await fetch( template ).then( response => response.text() );                 // load content of HTML template file
  template = template.replace( '__TITLE__', title ).replace( '__EMBED__', embed_code );   // integrate title and embed code
  info_file = await fetch( info_file ).then( response => response.blob() );               // load content of info file
  image_file = await fetch( image_file ).then( response => response.blob() );             // load content of image file

  // generate ZIP file
  !window.JSZip  && await loadScript( 'https://ccmjs.github.io/akless-components/libs/jszip/jszip.min.js' );
  !window.saveAs && await loadScript( 'https://ccmjs.github.io/akless-components/libs/FileSaver/FileSaver.js' );
  let widgetZip = new JSZip();
  widgetZip.folder( `${folder}.wdgt` ).file( 'index.html', template );
  widgetZip.folder( `${folder}.wdgt` ).file( 'Info.plist', info_file );
  widgetZip.folder( `${folder}.wdgt` ).file( 'Default.png', image_file );
  widgetZip = await widgetZip.generateAsync( { type: 'blob' } );

  // provide download of generated ZIP file
  saveAs( widgetZip, `${filename}.zip`);

};

/**
 * provides a download of a <i>ccmjs</i>-based app as SCORM package (ZIP file)
 * @function
 * @async
 * @param {string} embed_code - embed code (with included script tag) of the app
 * @param {string} [filename='app'] - filename without file extension
 * @param {string} [title='App'] - website title within the manifest
 * @param {string} [identifier='App'] - identifier within the manifest
 * @param {string} [html_template='https://ccmjs.github.io/akless-components/resources/templates/scorm/index.html'] - URL of HTML template
 * @param {string} [manifest_template='https://ccmjs.github.io/akless-components/resources/templates/scorm/imsmanifest.xml'] - URL of manifest template
 * @param {string} [api_file='https://ccmjs.github.io/akless-components/resources/templates/scorm/SCORM_API_wrapper.js'] - URL of SCORM API file
 * @returns {Promise<void>}
 * @memberOf ModuleHelper.AppHandover
 */
export const scorm = async ( embed_code, filename = 'app', title = 'App', identifier = 'App',
                             html_template = 'https://ccmjs.github.io/akless-components/resources/templates/scorm/index.html',
                             manifest_template = 'https://ccmjs.github.io/akless-components/resources/templates/scorm/imsmanifest.xml',
                             api_file = 'https://ccmjs.github.io/akless-components/resources/templates/scorm/SCORM_API_wrapper.js'
) => {

  // load templates
  html_template = await fetch( html_template ).then( response => response.text() );                 // load content of HTML template file
  html_template = html_template.replace( '__TITLE__', title ).replace( '__EMBED__', embed_code );   // integrate title and embed code in HTML template
  manifest_template = await fetch( manifest_template ).then( response => response.text() );         // load content of manifest template file
  manifest_template.replace( '__IDENTIFIER__', identifier ).replace( '__TITLE__', title );          // integrate identifier and title in manifest template
  api_file = await fetch( api_file ).then( response => response.blob() );                           // load content of SCORM API file

  // generate ZIP file
  !window.JSZip  && await loadScript( 'https://ccmjs.github.io/akless-components/libs/jszip/jszip.min.js' );
  !window.saveAs && await loadScript( 'https://ccmjs.github.io/akless-components/libs/FileSaver/FileSaver.js' );
  let widgetZip = new JSZip();
  widgetZip.file( 'index.html', html_template );
  widgetZip.file( 'imsmanifest.xml', manifest_template );
  widgetZip.file( 'SCORM_API_wrapper.js', api_file );
  widgetZip = await widgetZip.generateAsync( { type: 'blob' } );

  // provide download of generated ZIP file
  saveAs( widgetZip, `${filename}.zip` );

};

/*------------------------------------------------------ Others ------------------------------------------------------*/

/**
 * not categorizable helper functions
 * @namespace ModuleHelper.Others
 */

/**
 * copies text inside an HTML element to clipboard
 * @function
 * @param {Element} elem - HTML element
 * @example
 * // <body><input type="text" value="Hello World!"></body>
 * copyToClipboard( document.body.querySelector( 'input' ) )
 * // STRG+V then pastes 'Hello, World!' from clipboard
 * @memberOf ModuleHelper.Others
 */
export const copyToClipboard = elem => {
  elem.select();
  document.execCommand( 'copy' );
}

/**
 * provides a download of an on-the-fly created file
 * @function
 * @param {string} filename - filename including file extension
 * @param {string} content - content of the file
 * @param {string} [mime='text/html;charset=utf-8'] - media type followed by charset or 'base64' if non-textual
 * @example download( 'hello_world.html', '<!DOCTYPE html><meta charset="utf-8">Hello World!' )
 * @memberOf ModuleHelper.Others
 */
export const download = ( filename, content, mime = 'text/html;charset=utf-8' ) => {
  const element = document.createElement( 'a' );
  element.setAttribute( 'href', `data:${mime},${encodeURIComponent(content)}` );
  element.setAttribute( 'download', filename );
  element.style.display = 'none';
  document.body.appendChild( element );
  element.click();
  document.body.removeChild( element );
};

/**
 * shows the content of a webpage area in fullscreen mode
 * @function
 * @param {Element} elem - webpage area
 * @example
 * // <body><div id="app">Hello World!</div></body>
 * fullscreen( document.body.querySelector( '#app' ) )
 * @memberOf ModuleHelper.Others
 */
export const fullscreen = elem => {

  if ( elem.requestFullscreen )
    elem.requestFullscreen();
  else if ( elem.mozRequestFullScreen )    /* Firefox */
    elem.mozRequestFullScreen();
  else if ( elem.webkitRequestFullscreen ) /* Chrome, Safari and Opera */
    elem.webkitRequestFullscreen();
  else if ( elem.msRequestFullscreen )     /* IE/Edge */
    elem.msRequestFullscreen();

};

/**
 * executes the included code of a JavaScript file
 * @function
 * @async
 * @param {string} url - URL of the JavaScript file
 * @returns {Promise<void>}
 * @example await loadScript( 'https://ccmjs.github.io/akless-components/libs/jszip/jszip.min.js' )
 * @example await loadScript( 'https://ccmjs.github.io/akless-components/libs/FileSaver/FileSaver.js' )
 * @memberOf ModuleHelper.Others
 */
export const loadScript = async url => new Promise( ( resolve, reject ) => {

  const script = document.createElement( 'script' );
  document.head.appendChild( script );
  script.onload  = () => { document.head.removeChild( script ); resolve(); };
  script.onerror = () => { document.head.removeChild( script ); reject();  };
  script.async = true;
  script.src = url;

} );

/**
 * appends a progress bar to a DOM element
 * @function
 * @param {Element} obj.elem - progress bar will be appended to this element
 * @param {number} [obj.actual = 0] - actual points
 * @param {number} [obj.total = 100] - maximum points
 * @param {number} [obj.color = '#4CAF50'] - progressbar success color
 * @param {number} [obj.speed = 10] - animation speed
 * @memberOf ModuleHelper.Others
 */
export const progressBar = ( { elem, actual, total = 100, color = '#4CAF50', speed = 10 } ) => {
  const main = document.createElement( 'div' );
  console.log( total );
  main.innerHTML = `
    <div>${ Number.isInteger( actual ) ? actual + ( total ? '/' + total : '' ) : '' }</div>
    <div>
      <div></div>
    </div>
  `;
  main.setAttribute( 'style', 'min-width: 200px; max-width: 90%; margin: 1em 5%; padding: 0.5em 1em; display: flex; align-items: center; border: 1px solid lightgray; border-radius: 20px;' );
  elem.appendChild( main );

  const points = main.querySelector( 'div > div:first-child' );
  points.setAttribute( 'style', 'font-family: Verdana, Arial, sans-serif; font-size: 15px; font-stretch: expanded; margin-right: 0.5em; top: 2px;' );

  const progress_bar = main.querySelector( 'div > div:last-child' );
  progress_bar.setAttribute( 'style', 'width: 100%; height: 20px; background-color: #ddd; border-radius: 10px; overflow: hidden; position: relative;' );

  const progress = progress_bar.querySelector( 'div' );
  progress.setAttribute( 'style', 'width: 0%; height: 20px; background-color:' + color + '; position: absolute;' );

  if ( Number.isInteger( actual ) )
    setTimeout( () => {
      const goal = actual * progress_bar.offsetWidth / total;
      let width = 1;
      let id = setInterval( () => width >= goal ? clearInterval( id ) : progress.style.width = ( width += goal / 1000 * speed ) + 'px', 8 );
    }, 1 );
  else
    progress.style.width = ( actual ? progress_bar.offsetWidth : 0 ) + 'px';

};

/**
 * adds touch control to an element
 * @function
 * @param {Element} elem - element
 * @param {Function} onLeft - when swiping to the left
 * @param {Function} onRight - when swiping to the right
 * @memberOf ModuleHelper.Others
 */
export const touchControl = ( elem, { onLeft, onRight } ) => {

  let reachedEdge = false;
  let touchStart = null;
  let touchDown = false;
  elem.addEventListener( 'touchstart', () => touchDown = true );
  elem.addEventListener( 'touchmove', event => {
    if ( elem.scrollLeft === 0 || elem.scrollLeft === elem.scrollWidth - elem.clientWidth )
      reachedEdge = true;
    else {
      reachedEdge = false;
      touchStart = null;
    }
    if ( reachedEdge && touchDown ) {
      if ( touchStart === null )
        touchStart = event.changedTouches[ 0 ].clientX;
      else {
        let distance = event.changedTouches[ 0 ].clientX - touchStart;
        if ( distance > 100 ) {
          touchStart = null;
          reachedEdge = false;
          touchDown = false;
          onLeft();
        }
        else if ( distance < -100 ) {
          touchStart = null;
          reachedEdge = false;
          touchDown = false;
          onRight();
        }
      }
    }
  } );
  elem.addEventListener( 'touchend', () => {
    touchStart = null;
    touchDown = false;
  } );

};

/*----------------------------------------------------- Security -----------------------------------------------------*/

/**
 * helper functions for security handling
 * @namespace ModuleHelper.Security
 */

/**
 * @summary checks user permissions
 * @description
 * A dataset without permission settings is public data => access granted.<br>
 * Time-dependent permissions are not checked on client-side => access granted.<br>
 * The realm of user and of the permission settings must be the same.<br>
 * The creator has always all access right => access granted.<br>
 * @function
 * @param {Object} [settings] - permission settings or dataset with contained permission settings
 * @param {Object} [user] - user data or user instance that holds the user data
 * @param {string} operation - data operation that has to check: "get" (read), "set" (update) or "del" (delete)
 * @returns {boolean} true: access granted, false: access denied
 * @example
 * const settings = { creator: 'john', realm: 'guest', access: 'all' };
 * const user = { key: 'jane', realm: 'guest' };
 * hasPermission( settings, user, 'get' );  // => true: access granted
 * @example
 * const dataset = { _: {
 *   creator: 'john',
 *   realm: 'guest',
 *   group: [ 'john', 'jane' ],
 *   access: { get: 'all', set: 'group', del: 'creator' }
 * } };
 * const user = { key: 'jane', realm: 'guest' };
 * hasPermission( dataset, user, 'set' );  // => true: access granted
 * @example
 * const dataset = { _: {
 *   creator: 'john',
 *   realm: 'guest',
 *   group: {
 *     students: [ 'john', 'jane' ],
 *     teachers: [ 'jake' ]
 *   },
 *   access: { get: 'all', set: 'students,teachers', del: 'teachers' }
 * } };
 * const user = { key: 'jane', realm: 'guest' };
 * hasPermission( dataset, user, 'del' );  // => false: access denied
 * @memberOf ModuleHelper.Security
 */
export const hasPermission = ( settings, user, operation ) => {

  settings = settings._ ? settings._ : settings;                         // get permission settings
  if ( user && user.getValue ) user = user.getValue();                   // get user data from ccm user instance
  if ( !settings || !settings.creator || !settings.realm ) return true;  // dataset without permission settings? => access granted (public data)
  if ( Array.isArray( settings.access ) ) return true;                   // is time-dependent? => access granted (not checked on client-side)

  /**
   * access rights
   * @type {string|{get:string,set:string,del:string}}
   */
  const access = typeof settings.access === 'object' ? settings.access[ operation ] : settings.access;

  if ( access === 'all' ) return true;                                                                      // everyone has permission? => access granted (public data)
  if ( !user || !user.key || user.realm !== settings.realm ) return false;                                  // no user or wrong realm? => access denied
  if ( user.key === settings.creator ) return true;                                                         // user is creator? => access granted
  if ( access === 'group' ) return Array.isArray( settings.group ) && settings.group.includes( user.key );  // permission for group? => access granted if user is a group member

  /**
   * name of groups that have permission
   * @type {string[]}
   */
  const groups = access.split( ',' );

  // access granted if user is a member in any of these groups
  for ( let i = 0; i < groups.length; i++ )
    if ( settings.group && settings.group[ groups[ i ] ] && settings.group[ groups[ i ] ].includes( user.key ) ) return true;

  return false;  // user is not a member of any group => access denied
};

/**
 * checks if a user is the creator of a dataset
 * @function
 * @param {Object} dataset - dataset with contained permission settings
 * @param {Object} user - user data or user instance that holds the user data
 * @returns {boolean}
 * @example
 * const dataset = { _: { creator: 'john', realm: 'guest', access: 'all' } };
 * const user = { key: 'john', realm: 'guest' };
 * isCreator( dataset, user );  // => true
 * @memberOf ModuleHelper.Security
 */
export const isCreator = ( dataset, user ) => {
  if ( user.getValue ) user = user.getValue();
  return user && dataset && dataset._ && user.key && user.key === dataset._.creator && user.realm && user.realm === dataset._.realm;
};

/**
 * @summary privatizes public members of an instance
 * @description
 * Deletes all given properties in an object and returns another object with the deleted properties and there values.<br>
 * If no properties are given, then all not <i>ccmjs</i> relevant instance members will be privatized.<br>
 * List of <i>ccmjs</i> relevant properties that will not be privatized:
 * <ul>
 *   <li><code>ccm</code></li>
 *   <li><code>component</code></li>
 *   <li><code>config</code></li>
 *   <li><code>element</code></li>
 *   <li><code>id</code></li>
 *   <li><code>index</code></li>
 *   <li><code>inner</code></li>
 *   <li><code>parent</code></li>
 *   <li><code>root</code></li>
 *   <li><code>shadow</code></li>
 * </ul>
 * In addition to this: All functions and depending <i>ccmjs</i> context relevant instances will also not be privatized.
 * If the first passed property is boolean 'true', than the privatized properties will not be deleted in the passed instance.
 * @function
 * @param {Object} instance - instance created from a component
 * @param {...string|boolean} [keys] - properties that have to privatized
 * @returns {Object} object that contains the privatized properties and there values
 * @example
 * // privatize two public instance members
 * ccm.component( {
 *   name: 'dummy1',
 *   ccm: ccm,
 *   config: { foo: 'abc', bar: 'xyz', baz: 4711 },
 *   Instance: function () {
 *     let my;
 *     this.ready = async () => {
 *       my = ccm.helper.privatize( this, 'foo', 'bar' );
 *       console.log( my );                // => { foo: 'abc', bar: 'xyz' }
 *       console.log( my.foo, this.foo );  // => abc undefined
 *       console.log( my.bar, this.bar );  // => xyz undefined
 *       console.log( my.baz, this.baz );  // => undefined 4711
 *     };
 *   }
 * } );
 * @example
 * // privatize all possible public instance members
 * ccm.component( {
 *   name: 'dummy2',
 *   ccm: ccm,
 *   config: { foo: 'abc', bar: 'xyz', baz: 4711 },
 *   Instance: function () {
 *     let my;
 *     this.ready = async () => {
 *       my = ccm.helper.privatize( this );
 *       console.log( my );                // => { foo: 'abc', bar: 'xyz', baz: 4711 }
 *       console.log( my.foo, this.foo );  // => abc undefined
 *       console.log( my.bar, this.bar );  // => xyz undefined
 *       console.log( my.baz, this.baz );  // => 4711 undefined
 *     };
 *   }
 * } );
 * @example
 * // log all non-ccmjs specific instance members
 * ccm.component( {
 *   name: 'dummy3',
 *   ccm: ccm,
 *   config: { foo: 'abc', bar: 'xyz', baz: 4711, logger: [ 'ccm.instance', logger_component_url, logger_config ] },
 *   Instance: function () {
 *     this.ready = async () => {
 *       this.logger && this.logger.log( 'ready', $.privatize( this, true ) );
 *       console.log( this.foo, this.bar, this.foo );  // => abc xyz 4711
 *     };
 *   }
 * } );
 * @memberOf ModuleHelper.Security
 */
export const privatize = ( instance, ...keys ) => {

  let keep = false;
  if ( keys[ 0 ] === true ) keep = keys.shift();
  const obj = {};
  if ( keys.length )
    keys.forEach( key => privatizeProperty( key ) );
  else
    for ( const key in instance )
      privatizeProperty( key );
  return obj;

  function privatizeProperty( key ) {
    if ( key === true ) return;
    switch ( key ) {
      case 'ccm':
      case 'component':
      case 'config':
      case 'element':
      case 'id':
      case 'index':
      case 'inner':
      case 'parent':
      case 'root':
      case 'shadow':
        break;
      default:
        if ( typeof instance[ key ] === 'function' ) return;
        if ( instance[ key ] !== undefined ) obj[ key ] = instance[ key ];
        if ( !keep ) delete instance[ key ];
    }
  }

};

/**
 * filters script elements out of given HTML
 * @function
 * @param {string|Element} html - HTML string or HTML element
 * @returns {string|Element} cleaned HTML
 * @example protect( "Hello <script>alert('XSS');</script>World!" ) // => 'Hello World!'
 * @example
 * // <div>Hello <script>alert('XSS');</script>World!</div>
 * div = protect( div ); // => <div>Hello, World!</div>
 * @memberOf ModuleHelper.Security
 */
export const protect = html => {

  if ( typeof html === 'string' )
    return html.replace( /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '' );

  if ( ccm.helper.isElement( html ) )
    [ ...html.querySelectorAll( 'script' ) ].forEach( remove );

  return html;
};
