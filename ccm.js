/**
 * @overview
 * Core script of _ccmjs_ that is automatically loaded as soon as a component is integrated into a webpage.
 * The core script sets an object in the namespace [window.ccm]{@link ccm} that represents the loaded _ccmjs_ version
 * and defines the Custom Element <code>\<ccm-app\></code>.
 * @author André Kless <andre.kless@web.de> 2014-2022
 * @license The MIT License (MIT)
 * @version latest (27.4.2)
 * @changes
 * version 27.4.2 (04.11.2022)
 * - bugfix in ccm.helper.html2json: Preserve whitespaces and line breaks in pre-tags.
 * version 27.4.1 (20.10.2022)
 * - bugfix in ccm.helper.html for checked checkboxes
 * version 27.4.0 (17.06.2022)
 * - ccm.helper.generateKey returns a Universally Unique Identifier (UUID)
 * - better error handling when using IndexedDB
 * version 27.3.1 (14.02.2022)
 * - store.set() and store.del() returns original operation result
 * version 27.3.0 (14.02.2022)
 * - ccm.helper.html() accepts a instance reference and returns it as result
 * version 27.2.0 (17.01.2022)
 * - ccm.helper.isSubset() can check if a property not exists with value 'null'
 * version 27.1.2 (27.12.2021)
 * - highestByProperty() and nearestByProperty() returns null if there is no start instance
 * version 27.1.1 (28.09.2021)
 * - an instance created with ccm.start() is ready AFTER instance.start() is finished
 * version 27.1.0 (27.09.2021)
 * - added attribute 'ccm' for <ccm-app> to define used version of ccmjs (<ccm-app ccm="27.1.0" component="..." src="...">)
 * version 27.0.0 (24.09.2021)
 * - a source configuration is stored at property 'src' instead of 'key'
 * - an instance configuration can have recursive source configurations
 * (for older version changes see ccm-26.4.4.js)
 */

( () => {

  /**
   * Contains the registered components within this _ccmjs_ version.
   * @memberOf ccm
   * @private
   * @type {Object.<ccm.types.component_index, ccm.types.component_obj>}
   */
  const _components = {};

  /**
   * for creating ccm datastores
   * @private
   * @constructor
   */
  const Datastore = function () {

    /**
     * websocket communication callbacks
     * @type {Function[]}
     */
    const callbacks = [];

    /**
     * own reference for inner functions
     * @type {ccm.Datastore}
     */
    let that;

    /**
     * instance for user authentication
     * @type {Object}
     */
    let user;

    /**
     * is called once after for the initialization and is then deleted
     * @returns {Promise}
     */
    this.init = async () => {

      // remember own reference for inner functions
      that = this;

      // prepare ccm database in IndexedDB
      await prepareDB();

      // prepare websocket connection
      await prepareRealtime();

      // one-time call
      delete that.init;

      /**
       * prepares ccm database if data is managed in IndexedDB
       * @returns {Promise}
       */
      async function prepareDB() {

        // data is not managed in IndexedDB? => abort
        if ( !that.name || that.url ) return;

        await openDB();       // open database
        await createStore();  // create object store

        /**
         * opens ccm database if not already open
         * @returns {Promise}
         */
        function openDB() {
          return new Promise( ( resolve, reject ) => {
            if ( db ) return resolve();
            const idb = indexedDB.open( 'ccm' );
            idb.onsuccess = function () { db = this.result; resolve(); }
            idb.onerror = reject;
          } );
        }

        /**
         * creates object store if not already exists
         * @returns {Promise}
         */
        function createStore() { return new Promise( ( resolve, reject ) => {

          // object store already exists? => abort
          if ( db.objectStoreNames.contains( that.name ) ) return resolve();

          /**
           * current database version number
           * @type {number}
           */
          let version = parseInt( localStorage.getItem( 'ccm' ) );

          // no version number? => start with 1
          if ( !version ) version = 1;

          // close database
          db.close();

          /**
           * request for reopening database
           * @type {Object}
           */
          const request = indexedDB.open( 'ccm', version + 1 );

          // set callback for event when update is needed
          request.onupgradeneeded = function () {

            // remember ccm database object
            db = this.result;

            // remember new database version number in local storage
            localStorage.setItem( 'ccm', db.version );

            // create new object store
            db.createObjectStore( that.name, { keyPath: 'key' } );

          };
          request.onsuccess = resolve;
          request.onerror = reject;

        } ); }

      }

    };

    /** clears local cache */
    this.clear = () => that.local = {};

    /**
     * returns datastore source information
     * @returns {Object}
     */
    this.source = () => { return { name: that.name, url: that.url, db: that.db } };

    /**
     * requests one or more datasets
     * @param {ccm.types.key|Object} [key_or_query={}] - dataset key or query (default: query all datasets)
     * @returns {Promise}
     */
    this.get = ( key_or_query={} ) => new Promise( ( resolve, reject ) => {

      // no manipulation of passed original parameter (avoids unwanted side effects)
      key_or_query = ccm.helper.clone( key_or_query );

      // invalid key? => abort
      if ( !ccm.helper.isObject( key_or_query ) && !ccm.helper.isKey( key_or_query ) ) return reject( new Error( 'invalid dataset key: ' + key_or_query ) );

      // detect managed data level
      that.url ? serverDB() : ( that.name ? clientDB() : localCache() );

      /** requests dataset(s) from local cache */
      function localCache() {

        // get local dataset(s) from local cache
        resolve( ccm.helper.clone( ccm.helper.isObject( key_or_query ) ? runQuery( key_or_query ) : that.local[ key_or_query ] ) );

        /**
         * finds datasets in local cache by query
         * @param {Object} query
         * @returns {ccm.types.dataset[]}
         */
        function runQuery( query ) {

          const results = [];
          for ( const key in that.local ) ccm.helper.isSubset( query, that.local[ key ] ) && results.push( that.local[ key ] );
          return results;

        }

      }

      /** requests dataset(s) from client-side database */
      function clientDB() {

        const store = getStore();
        const request = ccm.helper.isObject( key_or_query ) ? store.getAll() : store.get( key_or_query );
        request.onsuccess = event => resolve( event.target.result || null );
        request.onerror   = event => reject( event.target.errorCode );

      }

      /** requests dataset(s) from server-side database */
      function serverDB() {

        ( that.socket ? useWebsocket : useHttp )( prepareParams( { get: key_or_query } ) ).then( resolve ).catch( error => checkError( error, reject ) );

      }

    } );

    /**
     * creates or updates a dataset
     * @param {Object} priodata - priority data
     * @returns {Promise}
     */
    this.set = priodata => new Promise( ( resolve, reject ) => {

      // no manipulation of passed original parameter (avoids unwanted side effects)
      priodata = ccm.helper.toJSON( priodata );

      // priority data has no key? => generate unique key
      if ( !priodata.key ) priodata.key = ccm.helper.generateKey();

      // priority data contains invalid key? => abort
      if ( !ccm.helper.isKey( priodata.key ) && !ccm.helper.isObject( priodata.key ) ) return reject( new Error( 'invalid dataset key: ' + priodata.key ) );

      // detect managed data level
      that.url ? serverDB() : ( that.name ? clientDB() : localCache() );

      /** creates/updates dataset in local cache */
      async function localCache() {

        // dataset already exists? => update
        if ( that.local[ priodata.key ] ) that.local[ priodata.key ] = await ccm.helper.integrate( priodata, that.local[ priodata.key ] );

        // dataset not exists? => create
        else that.local[ priodata.key ] = priodata;

        resolve( priodata );
      }

      /** creates/updates dataset in client-side database */
      function clientDB() {

        const request = getStore().put( priodata );
        request.onsuccess = event => resolve( event.target.result );
        request.onerror   = event => reject( event.target.errorCode );

      }

      /** creates/updates dataset in server-side database */
      function serverDB() {

        ( that.socket ? useWebsocket : useHttp )( prepareParams( { set: priodata } ) ).then( resolve ).catch( error => checkError( error, reject ) );

      }

    } );

    /**
     * deletes a dataset
     * @param {ccm.types.key} key - dataset key
     * @returns {Promise}
     */
    this.del = key => new Promise( ( resolve, reject ) => {

      // invalid key? => abort
      if ( !ccm.helper.isKey( key ) ) return reject( new Error( 'invalid dataset key: ' + key ) );

      // detect managed data level
      that.url ? serverDB() : ( that.name ? clientDB() : localCache() );

      /** deletes dataset in local cache */
      function localCache() {

        const dataset = that.local[ key ];
        delete that.local[ key ];
        resolve( dataset );

      }

      /** deletes dataset in client-side database */
      function clientDB() {

        const request = getStore().delete( key );
        request.onsuccess = event => resolve( event.target.result );
        request.onerror   = event => reject( event.target.errorCode );

      }

      /** deletes dataset in server-side database */
      function serverDB() {

        ( that.socket ? useWebsocket : useHttp )( prepareParams( { del: key } ) ).then( resolve ).catch( error => checkError( error, reject ) );

      }

    } );

    /**
     * counts number of stored datasets
     * @param {Object} [query] - count how many stored datasets match the query (not supported for IndexedDB)
     * @returns {Promise<number>}
     */
    this.count = query => new Promise( ( resolve, reject ) => {

      // detect managed data level
      that.url ? serverDB() : ( that.name ? clientDB() : localCache() );

      function localCache() {
        resolve( query ? that.get( query ).then( datasets => datasets.length ) : Object.keys( that.local ).length );
      }

      function clientDB() {
        const request = getStore().count();
        request.onsuccess = event => ( !isNaN( event.target.result ) ? resolve : reject )( event.target.result );
        request.onerror   = event => reject( event.target.errorCode );
      }

      function serverDB() {
        ( that.socket ? useWebsocket : useHttp )( prepareParams( query ? { count: query } : {} ) ).then( response => ( !isNaN( response ) ? resolve( parseInt( response ) ) : reject( response ) ) ).catch( error => checkError( error, reject ) );
      }

    } );

    /**
     * gets object store from IndexedDB
     * @returns {Object}
     */
    function getStore() {

      return db.transaction( [ that.name ], 'readwrite' ).objectStore( that.name );

    }

    /**
     * prepares data to be sent to server
     * @param {Object} [params] - data to be sent to server
     * @returns {Object} prepared data
     */
    function prepareParams( params = {} ) {

      if ( that.db ) params.db = that.db;
      params.store = that.name;
      if ( that.realm === null ) return params;
      user = ccm.context.find( that, 'user' );
      if ( that.token && that.realm ) {
        params.realm = that.realm;
        params.token = that.token;
      }
      else if ( user && user.isLoggedIn() ) {
        params.realm = user.getRealm();
        params.token = ( user.getValue ? user.getValue() : user.data() ).token;
      }
      return params;

    }

    /**
     * checks server error
     * @param error
     * @param reject
     * @returns {Promise<void>}
     */
    async function checkError( error, reject ) {

      // token has expired? => user must login again and app restarts
      if ( error && ( error === 401 || error === 403 || error.data && ( error.data.status === 401 || error.data.status === 403 ) ) && user ) {
        try {
          await user.logout();
          await user.login();
          await ccm.context.root( user ).start();
        }
        catch ( e ) {
          await ccm.context.root( user ).start();
        }
      }
      else
        reject( error );
    }

    /**
     * prepares the realtime functionality
     * @returns {Promise}
     */
    function prepareRealtime() { return new Promise( resolve => {

      // is no ccm realtime datastore? => abort
      if ( !that.url || that.url.indexOf( 'ws' ) !== 0 ) return resolve();

      // no change callback and not a standalone datastore? => set default change callback: restart parent
      if ( !that.onchange && that.parent ) that.onchange = that.parent.start;

      // prepare initial message
      let message = [ that.db, that.name ];
      if ( that.dataset ) { that.observe = that.dataset; delete that.dataset; }
      if ( that.observe ) {
        if ( !Array.isArray( that.observe ) ) that.observe = [ that.observe ];
        that.observe = that.observe.map( key_or_query => ccm.helper.isObject( key_or_query ) ? JSON.stringify( key_or_query ) : key_or_query );
        message = message.concat( that.observe );
      }

      // connect to server
      that.socket = new WebSocket( that.url, 'ccm-cloud' );

      // set server notification callback
      that.socket.onmessage = message => {

        // parse server message to JSON
        const {callback,data} = ccm.helper.parse( message.data );

        // own request? => perform callback
        if ( callback ) { callbacks[ callback ]( data ); delete callbacks[ callback ]; }

        // notification about changed data from other client? => perform change callback
        else that.onchange && that.onchange( data );

      };

      // send initial message
      that.socket.onopen = () => { that.socket.send( message ); resolve(); };

    } ); }

    /**
     * sends data to server interface via websocket connection
     * @param {Object} params - data to be sent to server
     * @returns {Promise}
     */
    function useWebsocket( params ) { return new Promise( ( resolve, reject ) => {

      const key = ccm.helper.generateKey();
      callbacks[ key ] = result => Number.isInteger( result ) ? checkError( result, reject ) : resolve( result );
      params.callback = key;
      try {
        if ( that.socket.readyState > 1 )
          prepareRealtime().then( () => that.socket.send( ccm.helper.stringify( params ) ) );
        else
          that.socket.send( ccm.helper.stringify( params ) );
      }
      catch ( e ) {
        prepareRealtime().then( () => that.socket.send( ccm.helper.stringify( params ) ) );
      }

    } ); }

    /**
     * sends data to server interface via HTTP request
     * @param {Object} params - data to be sent to server
     * @returns {Promise}
     */
    function useHttp( params ) {

      return ccm.load( { url: that.url, params: params, method: that.method } );

    }

  };

  /**
   * ccm database in IndexedDB
   * @type {Object}
   */
  let db;

  // set global namespace
  if ( !window.ccm ) window.ccm = {

    /**
     * @description
     * JSONP callbacks for cross domain data exchanges via {@link ccm.load} are temporarily stored here (is always emptied directly).
     * This global namespace <code>ccm.callbacks</code> is also used for dynamic loading of JavaScript modules.
     * The namespace is only used internally by _ccmjs_ and should not used by component developers.
     * @memberOf ccm
     * @type {Object.<string,function>}
     * @tutorial loading-of-resources
     */
    callbacks: {},

    /**
     * @description
     * Result data of loaded JavaScript files via {@link ccm.load} are temporarily stored here (is always emptied directly).
     * The namespace is only used internally by _ccmjs_ and should not used by component developers.
     * @memberOf ccm
     * @type {Object}
     * @tutorial loading-of-resources
     */
    files: {}

  };

  /**
   * Everything around _ccmjs_ is capsuled in the single global namespace <code>window.ccm</code>.
   * The namespace contains the latest version of _ccmjs_ that has been loaded so far within the webpage.
   * In the webpage a _ccmjs_ version is represented as a JavaScript object.
   * The object provides methods for [using components]{@tutorial usage-of-components}, [loading of resources]{@tutorial loading-of-resources} and [data management]{@tutorial data-management}.
   * For [backwards compatibility]{@tutorial backwards-compatibility} each _ccmjs_ version loaded on the webpage so far has its own inner namespace within <code>window.ccm</code>.
   * This ensures that different versions of _ccmjs_ can be used without conflict within the same webpage.
   * @global
   * @namespace
   */
  const ccm = {

    /**
     * @description Returns the _ccmjs_ version.
     * @returns {ccm.types.version_nr}
     */
    version: () => '27.4.2',

    /**
     * @summary loads resources
     * @description
     * _ccmjs_ provides a service for asynchronous loading of resources. It could be used with the method <code>ccm.load</code>.
     * You can load resources like HTML, CSS, Images, JavaScript, Modules, JSON and XML data on-demand and cross-domain.
     * On a single call several resources can be loaded at once. It can be flexibly controlled which resources are loaded in serial and which in parallel.
     * See {@tutorial loading-of-resources} to learn everything about this method. There are also more examples how to use it.
     * This method can be used to define dependencies to other resources in [instance configurations]{@link ccm.types.instance_config}.
     * @param {...(string|ccm.types.resource_obj)} resources - resources data
     * @returns {Promise<*>}
     * @tutorial loading-of-resources
     */
    load: function () {

      /**
       * arguments of this ccm.load call
       * @type {Array}
       */
      const args = [ ...arguments ];

      /**
       * current ccm.load call
       * @type {ccm.types.action}
       */
      const call = args.slice( 0 ); call.unshift( ccm.load );

      /**
       * result(s) of this ccm.load call
       * @type {*}
       */
      let results = [];

      /**
       * number of resources being loaded
       * @type {number}
       */
      let counter = 1;

      /**
       * indicates whether loading of at least one resource failed
       * @type {boolean}
       */
      let failed = false;

      return new Promise( ( resolve, reject ) => {

        // iterate over resources data => load resource(s)
        args.forEach( ( resource, i ) => {

          // increase number of resources being loaded
          counter++;

          // no manipulation of passed original parameters (avoids unwanted side effects)
          resource = ccm.helper.clone( resource );

          // resource data is an array? => load resources serially
          if ( Array.isArray( resource ) ) { results[ i ] = []; serial( null ); return; }

          // has resource URL instead of resource data? => use resource data which contains only the URL information
          if ( !ccm.helper.isObject( resource ) ) resource = { url: resource };

          /**
           * file extension from the URL of the resource
           * @type {string}
           */
          const suffix = resource.url.split( '.' ).pop().split( '?' ).shift().split( '#' ).shift().toLowerCase();

          // ensuring lowercase on HTTP method
          if ( resource.method ) resource.method = resource.method.toLowerCase();

          // no given resource context or context is 'head'? => load resource in global <head> context (no Shadow DOM)
          if ( !resource.context || resource.context === 'head' ) resource.context = document.head;

          // given resource context is a ccm instance? => load resource in shadow root context of that instance
          if ( ccm.helper.isInstance( resource.context ) ) resource.context = resource.context.element.parentNode;

          /**
           * operation for loading resource
           * @type {Function}
           */
          const operation = getOperation();

          // timeout check
          let timeout; ccm.timeout && window.setTimeout( () => timeout === undefined && ( timeout = true ) && error( 'timeout' ), ccm.timeout );

          // start loading of resource
          operation();

          /**
           * loads resources serially (recursive function)
           * @param {*} result - result of last serially loaded resource (is null on first call)
           */
          function serial( result ) {

            // not the first call? => add result of last call to serially results
            if ( result !== null ) results[ i ].push( result );

            // serially loading of resources completed? => finish serially loading and check if all resources of this ccm.load call are loaded
            if ( resource.length === 0 ) return check();

            // load next resource serially (recursive call of ccm.load and this function)
            let next = resource.shift(); if ( !Array.isArray( next ) ) next = [ next ];
            ccm.load.apply( null, next ).then( serial ).catch( serial );
            // if next resource is an array, contained resources are loaded in parallel

          }

          /**
           * determines operation for loading resource
           * @returns {Function}
           */
          function getOperation() {

            switch ( resource.type ) {
              case 'html':   return loadHTML;
              case 'css':    return loadCSS;
              case 'image':  return loadImage;
              case 'js':     return loadJS;
              case 'module': return loadModule;
              case 'json':   return loadJSON;
              case 'xml':    return loadXML;
            }

            switch ( suffix ) {
              case 'html':
                return loadHTML;
              case 'css':
                return loadCSS;
              case 'jpg':
              case 'jpeg':
              case 'gif':
              case 'png':
              case 'svg':
              case 'bmp':
                return loadImage;
              case 'js':
                return loadJS;
              case 'mjs':
                return loadModule;
              case 'xml':
                return loadXML;
              default:
                return loadJSON;
            }

          }

          /** loads a HTML file */
          function loadHTML() {

            // load HTML as string via HTTP GET request
            resource.type = 'html';
            resource.method = 'get';
            loadJSON();

          }

          /** loads (and executes) a CSS file */
          function loadCSS() {

            // already exists in same context? => abort
            if ( resource.context.querySelector( 'link[rel="stylesheet"][type="text/css"][href="' + resource.url + '"]' ) ) return success();

            // load the CSS file via a <link> element
            let element = { tag: 'link', rel: 'stylesheet', type: 'text/css', href: resource.url };
            if ( resource.attr ) element = Object.assign( element, resource.attr );
            element = ccm.helper.html( element );
            element.onload  = success;
            element.onerror = event => { element.parentNode.removeChild( element ); error( element, event ); };
            resource.context.appendChild( element );

          }

          /** (pre)loads an image file */
          function loadImage() {

            // (pre)load the image file via an image object
            const image = new Image();
            image.onload = success;
            image.onerror = event => error( image, event );
            image.src = resource.url;

          }

          /** loads (and executes) a JavaScript file */
          function loadJS() {

            /**
             * filename of JavaScript file (without '.min')
             * @type {string}
             */
            const filename = resource.url.split( '/' ).pop().split( '?' ).shift().replace( '.min.', '.' );

            // mark JavaScript file as loading
            window.ccm.files[ filename ] = null; window.ccm.files[ '#' + filename ] = window.ccm.files[ '#' + filename ] ? window.ccm.files[ '#' + filename ] + 1 : 1;

            // load the JavaScript file via a <script> element
            let element = { tag: 'script', src: resource.url, async: true };
            if ( resource.attr ) element = Object.assign( element, resource.attr );
            element = ccm.helper.html( element );
            element.onload = () => {

              /**
               * data globally stored by loaded JavaScript file
               * @type {*}
               */
              const data = window.ccm.files[ filename ];

              // remove stored data from global context
              if ( !--window.ccm.files[ '#' + filename ] ) { delete window.ccm.files[ filename ]; delete window.ccm.files[ '#' + filename ]; }

              // remove no more needed <script> element
              element.parentNode.removeChild( element );

              // perform success callback
              data !== null ? successData( data ) : success();

            };
            element.onerror = event => { element.parentNode.removeChild( element ); error( element, event ); };
            resource.context.appendChild( element );

          }

          /** loads a JavaScript module */
          function loadModule() {
            let [ url, ...keys ] = resource.url.split( '#' );
            if ( url.startsWith( './' ) ) url = url.replace( './', location.href.substring( 0, location.href.lastIndexOf( '/' ) + 1 ) );
            import( url ).then( result => {
              if ( keys.length === 1 ) result = result[ keys[ 0 ] ]
              if ( keys.length > 1 ) {
                const obj = {};
                keys.forEach( key => obj[ key ] = result[ key ] );
                result = obj;
              }
              successData( result );
            } );
          }

          /** loads JSON data */
          function loadJSON() {

            // load data using desired method
            switch ( resource.method ) {
              case 'jsonp':
                jsonp();
                break;
              case 'get':
              case 'post':
              case 'put':
              case 'delete':
                ajax();
                break;
              case 'fetch':
                fetchAPI();
                break;
              default:
                resource.method = 'post';
                ajax();
            }

            /** performs a data exchange via JSONP */
            function jsonp() {

              // prepare callback function
              const callback = 'callback' + ccm.helper.generateKey();
              if ( !resource.params ) resource.params = {};
              resource.params.callback = 'window.ccm.callbacks.' + callback;
              window.ccm.callbacks[ callback ] = data => {
                element.parentNode.removeChild( element );
                delete window.ccm.callbacks[ callback ];
                successData( data );
              };

              // prepare <script> element for data exchange
              let element = { tag: 'script', src: buildURL( resource.url, resource.params ) };
              if ( resource.attr ) element = Object.assign( element, resource.attr );
              element = ccm.helper.html( element );
              element.onerror = event => { element.parentNode.removeChild( element ); error( element, event ); };
              element.src = element.src.replace( /&amp;/g, '&' );  // TODO: Why is this "&amp;" happening in ccm.helper.html?

              // start data exchange
              resource.context.appendChild( element );

            }

            /** performs a data exchange via AJAX request */
            function ajax() {

              const request = new XMLHttpRequest();
              request.open( resource.method, resource.method === 'get' && resource.params ? buildURL( resource.url, resource.params ) : resource.url, true );
              if ( resource.headers )
                for ( const key in resource.headers ) {
                  request.setRequestHeader( key, resource.headers[ key ] );
                  if ( key.toLowerCase() === 'authorization' )
                    request.withCredentials = true;
                }
              ( resource.method === 'post' || resource.method === 'put' ) && request.setRequestHeader( 'Content-Type', 'application/json' );
              request.onreadystatechange = () => {
                if ( request.readyState === 4 )
                  request.status >= 200 && request.status < 300 ? successData( request.responseText ) : error( request );
              };
              request.send( resource.method === 'post' || resource.method === 'put' ? ccm.helper.stringify( resource.params ) : undefined );
            }

            /** performs a data exchange via fetch API */
            function fetchAPI() {
              if ( !resource.init ) resource.init = {};
              if ( resource.params ) resource.init.method.toLowerCase() === 'post' ? resource.init.body = ccm.helper.stringify( resource.params) : resource.url = buildURL( resource.url, resource.params );
              fetch( resource.url, resource.init ).then( response => response.text() ).then( successData ).catch( error );
            }

            /**
             * adds HTTP parameters in URL
             * @param {string} url - URL
             * @param {Object} data - HTTP parameters
             * @returns {string} URL with added HTTP parameters
             */
            function buildURL( url, data ) {
              if ( ccm.helper.isObject( data.json ) ) data.json = ccm.helper.stringify( data.json );
              return data ? url + '?' + params( data ).slice( 0, -1 ) : url;
              function params( obj, prefix ) {
                let result = '';
                for ( const i in obj ) {
                  const key = prefix ? prefix + '[' + encodeURIComponent( i ) + ']' : encodeURIComponent( i );
                  if ( typeof( obj[ i ] ) === 'object' )
                    result += params( obj[ i ], key );
                  else
                    result += key + '=' + encodeURIComponent( obj[ i ] ) + '&';
                }
                return result;
              }

            }

          }

          /** loads a XML file */
          function loadXML() {

            if ( !resource.method ) resource.method = 'post';
            const request = new XMLHttpRequest();
            request.overrideMimeType( 'text/xml' );
            request.onreadystatechange = () => {
              if ( request.readyState === 4 )
                request.status === 200 ? successData( request.responseXML ) : error( request );
            };
            request.open( resource.method, resource.url, true );
            request.send();

          }

          /**
           * when a data exchange has been completed successfully
           * @param {*} data - received data
           */
          function successData( data ) {

            // timeout already occurred? => abort (counter will not decrement)
            if ( checkTimeout() ) return;

            // received data is a JSON string? => parse it to JSON
            try { if ( typeof data !== 'object' ) data = ccm.helper.parse( data ); } catch ( e ) {}

            // received data is loaded HTML? => look for <ccm-template> tags
            if ( resource.type === 'html' ) {
              const regex = /<ccm-template key="(\w*?)">([^]*?)<\/ccm-template>/g;
              const result = {}; let array;
              while ( array = regex.exec( data ) )
                result[ array[ 1 ] ] = array[ 2 ];
              if ( Object.keys( result ).length ) data = result;
            }

            // add received data to results of ccm.load call and to cache
            results[ i ] = data;

            // perform success callback
            success();

          }

          /** when a resource is loaded successfully */
          function success() {

            // timeout already occurred? => abort (counter will not decrement)
            if ( checkTimeout() ) return;

            // is there no result value yet? => use URL as result
            if ( results[ i ] === undefined ) results[ i ] = resource.url;

            // check if all resources are loaded
            check();

          }

          /**
           * checks if timeout already occurred
           * @returns {boolean}
           */
          function checkTimeout() {

            return timeout ? ccm.helper.log( 'loading of ' + resource.url + ' succeeded after timeout (' + ccm.timeout + 'ms)' ) || true : timeout = false;

          }

          /**
           * when loading of a resource failed
           * @param {...*} data - relevant process data
           */
          function error() {

            // loading of at least one resource failed
            failed = true;

            // create load error data
            results[ i ] = {
              error: new Error( 'loading of ' + resource.url + ' failed' ), // error object
              resource: resource,                                           // resource data
              data: [ ...arguments ],                                       // relevant process data
              call: call                                                    // ccm.load call
            };
            if ( results[ i ].data.length <= 1 ) results[ i ].data = results[ i ].data[ 0 ];

            // check if all resources are loaded
            check();

          }

        } );

        // check if all resources are loaded (important if all resources are already loaded)
        check();

        /** checks if all resources are loaded */
        function check() {

          // still more loading resources left? => abort
          if ( --counter ) return;

          // only one result? => do not use an array
          if ( results.length === 1 )
            results = results[ 0 ];

          // finish this ccm.load call
          ( failed ? reject : resolve )( results );

        }

      } );

    },

    /**
     * @summary registers a component
     * @description
     * Registers a component within this _ccmjs_ version. The returned [component object]{@link ccm.types.component_obj} can than be used for flexible [instance]{@link ccm.types.instance} creation.
     * This method can be used to define dependencies to other components in [instance configurations]{@link ccm.types.instance_config}.
     * After registration, the component is ready to use on the webpage.
     * If a URL to a component file is passed instead of a [component object]{@link ccm.types.component_obj}, the object is determined by loading this file.
     * If the component uses a different _ccmjs_ version, this version is loaded (if not already present) and then the component is registered in that _ccmjs_ version instead.
     * With the `config` parameter you can pass a default [instance configuration]{@link ccm.types.instance_config} that will be integrated with higher priority in the default [instance configuration]{@link ccm.types.instance_config} that is defined by the component.
     * The resulting default configuration applies for all [instances]{@link ccm.types.instance} that are created via the returned [component object]{@link ccm.types.component_obj}.
     * @param {ccm.types.component_obj|string} component - component object or URL of a component file
     * @param {ccm.types.instance_config} [config] - default configuration for instances that are created out of the component (check documentation of associated component to see which properties could be set)
     * @returns {Promise<ccm.types.component_obj>} cloned component object (the original cannot be reached from the outside for security reasons)
     * @example
     * const component_obj = await ccm.component( {
     *   name: 'blank',
     *   ccm: 'https://ccmjs.github.io/ccm/ccm.js',
     *   Instance: function () {
     *     this.start = async () => {
     *       this.element.innerHTML = 'Hello, World!';
     *     };
     *   }
     * } );
     * const instance = await component_obj.instance( { root: document.body } );
     * await instance.start();
     * @example
     * const component_obj = await ccm.component(
     *   'https://ccmjs.github.io/akless-components/blank/ccm.blank.js'
     * );
     * const instance = await component_obj.instance( { root: document.body } );
     * await instance.start();
     * @tutorial usage-of-components
     */
    component: async ( component, config ) => {

      // get component object
      component = await getComponentObject();

      // no component object? => throw error
      if ( !ccm.helper.isComponent( component ) ) throw new Error( 'invalid component object' );

      // used ccmjs version could be set via config
      await changeVersion( component, config );

      // load needed ccmjs version and remember version number
      const version = ( ccm.helper.isCore( component.ccm ) ? component.ccm : await ccm.helper.loadVersion( component.ccm ) ).version();

      // component uses other ccmjs version? => register component via other ccmjs version (and considers backward compatibility)
      if ( version !== ccm.version() ) return new Promise( async resolve => {
        const result = await window.ccm[ version ].component( component, config, resolve );
        result && resolve( result );
      } );

      // set component index
      component.index = component.name + ( component.version ? '-' + component.version.join( '-' ) : '' );

      // component not registered? => register component
      if ( !_components[ component.index ] ) {

        // register component
        _components[ component.index ] = component;

        // create global component namespaces
        ccm.components[ component.index ] = {};

        component.instances = 0;         // add ccm instance counter
        component.ccm = window.ccm[ version ];  // add ccmjs reference

        // initialize component
        component.ready && await component.ready.call( component ); delete component.ready;

        // define HTML tag for component
        await defineCustomElement( component.index );

      }

      // is registered => use already registered component object (security reasons)
      else component = _components[ component.index ];

      // no manipulation of original registered component object (security reasons)
      component = ccm.helper.clone( component );

      // set default instance configuration
      component.config = await prepareConfig( config, component.config );

      // add functions for creating and starting ccm instances
      component.instance = async config => await ccm.instance( component, await prepareConfig( config, component.config ) );
      component.start    = async config => await ccm.start   ( component, await prepareConfig( config, component.config ) );

      return component;

      /**
       * gets component object
       * @returns {Promise}
       */
      async function getComponentObject() {

        // component is given as string? (component index or URL)
        if ( typeof component === 'string' ) {

          /**
           * component index
           * @type {ccm.types.index}
           */
          const index = component.endsWith( '.js' ) ? ccm.helper.convertComponentURL( component ).index : component;

          // already registered component? => use already registered component object
          if ( _components[ index ] ) return ccm.helper.clone( _components[ index ] );

          // has component URL? => load component object
          if ( ccm.helper.regex( 'filename' ).test( component.split( '/' ).pop() ) ) { const response = await ccm.load( component ); response.url = component; return response; }

          // not registered and no URL? => throw error
          return new Error( 'invalid component index or URL: ' + component );

        }

        // component is directly given as object
        return component;

      }

    },

    /**
     * @summary registers a component and creates an instance out of it
     * @description
     * This method does the same as {@link ccm.component} with the difference that an [instance]{@link ccm.types.instance} is created directly from the component after the registration.
     * The created [instance]{@link ccm.types.instance} is returned as result. Whenever the start method of the [instance]{@link ccm.types.instance} is called, the [instance]{@link ccm.types.instance} begins to design the webpage area assigned to it.
     * This method can be used to define dependencies to other [instances]{@link ccm.types.instance} in [instance configurations]{@link ccm.types.instance_config}.
     * The given [instance configuration]{@link ccm.types.instance_config} will be integrated with higher priority in the default [instance configuration]{@link ccm.types.instance_config} that is defined by the component.
     * @param {ccm.types.component_obj|string} component - component object or URL of a component file
     * @param {Object} [config] - instance configuration (check documentation of associated component to see which properties could be set)
     * @returns {Promise<ccm.types.instance>}
     * @example
     * const instance = await ccm.instance( {
     *   name: 'blank',
     *   ccm: 'https://ccmjs.github.io/ccm/ccm.js',
     *   Instance: function () {
     *     this.start = async () => {
     *       this.element.innerHTML = 'Hello, World!';
     *     };
     *   }
     * }, { root: document.body } );
     * await instance.start();
     * @example
     * const instance = await ccm.instance(
     *   'https://ccmjs.github.io/akless-components/blank/ccm.blank.js',
     *   { root: document.body }
     * );
     * await instance.start();
     * @tutorial usage-of-components
     */
    instance: async ( component, config ) => {

      // has root element? => add loading icon
      if ( config && config.root && config.parent ) { config.root.innerHTML = ''; config.root.appendChild( ccm.helper.loading( config.parent ) ); }

      // get object of ccm component
      component = await ccm.component( component, { ccm: config && config.ccm } ); config && delete config.ccm;

      // prepare ccm instance configuration
      config = await prepareConfig( config, component.config );

      // perform 'beforeCreation' callback
      config.beforeCreation && await config.beforeCreation( config, ccm.helper.clone( component ) ); delete config.beforeCreation;

      // no component object? => abort
      if ( !ccm.helper.isComponent( component ) ) return component;

      // component uses other ccmjs version? => create instance via other ccmjs version (and considers backward compatibility)
      if ( component.ccm.version() !== ccm.version() ) return new Promise( async resolve => {
        const result = await window.ccm[ component.ccm.version() ].instance( component, config, resolve );
        result && resolve( result );
      } );

      /**
       * created and prepared ccm instance
       * @type {ccm.types.instance}
       */
      let instance = createInstance();

      // perform 'afterCreation' callback
      config.afterCreation && await config.afterCreation( config, ccm.helper.clone( component ) ); delete config.afterCreation;

      // each instance knows his original config
      instance.config = ccm.helper.stringify( config );

      // root element without DOM contact? => add root in <head> (resolving dependencies requires DOM contact)
      if ( !document.contains( instance.root ) ) {
        instance.root.position = document.createElement( 'div' );
        if ( instance.root.parentNode )
          instance.root.parentNode.replaceChild( instance.root.position, instance.root );
        document.head.appendChild( instance.root );
      }

      // solve ccm dependencies contained in config
      config = await ccm.helper.solveDependencies( config, instance );

      // restore original root position
      if ( document.head.contains( instance.root ) ) {
        document.head.removeChild( instance.root );
        if ( instance.root.position.parentNode )
          instance.root.position.parentNode.replaceChild( instance.root, instance.root.position );
        delete instance.root.placeholder;
      }

      // convert Light DOM to Element Node
      config.inner = ccm.helper.html( config.inner, undefined, { no_evaluation: true } );

      // integrate config in created ccm instance
      Object.assign( instance, config );

      // initialize created and dependent instances
      if ( !instance.parent || !instance.parent.init ) await initialize();

      // perform 'onReady' callback
      instance.onReady && await instance.onReady( instance ); delete instance.onReady;

      return instance;

      /**
       * creates and prepares a ccm instance out of component
       * @returns {ccm.types.instance}
       */
      function createInstance() {

        /**
         * created ccm instance
         * @type {ccm.types.instance}
         */
        const instance = new component.Instance();

        // set ccm specific instance properties
        instance.ccm       = component.ccm;                               // ccmjs reference
        instance.component = component;                                   // set component reference
        instance.parent    = config.parent; delete config.parent;         // reference of parent ccm instance
        instance.children  = {};                                          // reference to children instances
        instance.root      = config.root;   delete config.root;           // instance root element
        instance.id        = ++_components[ component.index ].instances;  // instance ID
        instance.index     = component.index + '-' + instance.id;         // instance index (unique in hole website)
        setElement();                                                     // set root and content element
        if ( !instance.init ) instance.init = async () => {};             // each instance must have a init method
        if ( instance.parent ) {
          if ( !instance.parent.children ) instance.parent.children = {};
          instance.parent.children[ instance.index ] = instance;
        }

        // state of an instance can be influenced by HTML attributes of instance root element
        if ( instance.root.id === instance.index && instance.root.parentNode && instance.root.parentNode.tagName.indexOf( 'CCM-' ) === 0 ) watchAttributes();

        return instance;

        /** sets root element with contained Shadow DOM and content element */
        function setElement() {

          // root is keyword 'parent'? => use parent root and content element
          if ( instance.root === 'parent' && instance.parent ) {
            instance.root    = instance.parent.root;
            instance.element = instance.parent.element;
            return;
          }

          // root is a string? => use inner website area of the parent where HTML ID is equal to given string or component name (if root is keyword 'name')
          if ( typeof instance.root === 'string' ) instance.root = instance.parent.element.querySelector( '#' + ( instance.root === 'name' && instance.parent ? component.name : instance.root ) );

          /**
           * root element of ccm instance
           * @type {Element}
           */
          const root = ccm.helper.html( { id: instance.index } );

          // set root element
          if ( instance.root ) { instance.root.innerHTML = ''; instance.root.appendChild( root ); instance.root = root; }

          // handle Shadow DOM
          if ( !config.shadow ) config.shadow = 'closed';
          if ( typeof config.shadow === 'string' && config.shadow !== 'none' ) {
            instance.shadow = root.shadowRoot || root.attachShadow( { mode: config.shadow } );
            delete config.shadow;
          }

          // set content element
          ( instance.shadow || root ).appendChild( instance.element = ccm.helper.html( { id: 'element' } ) );

          // set observed responsive breakpoints for content element
          config.breakpoints !== false && ccm.helper.responsive( instance.element, config.breakpoints, instance );

          // make the element focusable (allows component-specific keyboard events)
          config.focusable !== false && instance.element.setAttribute( 'tabindex', '-1' );

          if ( !instance.root ) instance.root = root;

          // has start method? => add loading icon
          if ( instance.start ) { instance.element.innerHTML = ''; instance.element.appendChild( ccm.helper.loading( instance ) ); }

        }

        /** watches HTML attributes of instance root element */
        function watchAttributes() {

          // instance has no update method? => set default update method
          if ( !instance.update ) instance.update = ( key, value ) => {
            switch ( key ) {
              case 'ccm':
              case 'component':
              case 'config':
              case 'element':
              case 'id':
              case 'index':
              case 'init':
              case 'onfinish':
              case 'parent':
              case 'ready':
              case 'root':
              case 'start':
              case 'update':
                break;
              case 'key':
                if ( ccm.helper.regex( 'json' ).test( value ) ) value = ccm.helper.parse( value );
                if ( ccm.helper.isObject( value ) )
                  for ( const key in value )
                    if ( value.hasOwnProperty( key ) )
                      switch ( key ) {
                        case 'ccm':
                        case 'component':
                        case 'dependency':
                        case 'parent':
                        case 'id':
                        case 'index':
                        case 'element':
                        case 'root':
                        case 'init':
                        case 'ready':
                        case 'start':
                        case 'update':
                        case 'key':
                          break;
                        default:
                          instance[ key ] = value[ key ]
                      }
                instance.start();
                break;
              default:
                instance[ key ] = value;
                instance.start();
            }
          };

          // watch attributes
          const MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
          const observer = new MutationObserver( mutations =>
            mutations.forEach( mutation => {
              if ( mutation.type !== 'attributes' ) return;
              const key   = mutation.attributeName;
              const value = instance.root.parentNode.getAttribute( key );
              instance.update( key, value );
            } )
          );
          observer.observe( instance.root.parentNode, { attributes: true } );

        }

      }

      /**
       * calls init and ready method of created and dependent ccm instances
       * @returns {Promise}
       */
      function initialize() {

        return new Promise( resolve => {

          /**
           * founded ccm instances
           * @type {ccm.types.instance[]}
           */
          const instances = [ instance ];

          // find dependent ccm instances
          find( instance );

          // call init methods of all founded ccm instances
          let i = 0; init();

          /**
           * finds all ccm instances (breadth-first-order, recursive)
           * @param {Object|Array} obj - object/array that is searched
           */
          function find( obj ) {

            /**
             * founded relevant inner objects/arrays (needed to get breath-first-order)
             * @type {Array.<Object|Array>}
             */
            const relevant = [];

            // search object/array
            for ( const key in obj )
              if ( obj.hasOwnProperty && obj.hasOwnProperty( key ) ) {
                const value = obj[ key ];

                // value is a ccm instance? (but not parent or proxy instance) => add to founded instances
                if ( ccm.helper.isInstance( value ) && key !== 'parent' && !ccm.helper.isProxy( value) ) { instances.push( value ); relevant.push( value ); }

                // value is an object/array?
                else if ( Array.isArray( value ) || ccm.helper.isObject( value ) ) {

                  // not relevant object type? => skip
                  if ( ccm.helper.isSpecialObject( value ) ) continue;

                  // add value to relevant inner objects/arrays
                  relevant.push( value );

                }

              }

            // search relevant inner objects/arrays (recursive calls)
            relevant.map( find );

          }

          /** calls init methods (forward) of all founded ccm instances (recursive, asynchron) */
          function init() {

            // all init methods called? => call ready methods
            if ( i === instances.length ) return ready();

            /**
             * first founded ccm instance with not called init method
             * @type {ccm.types.instance}
             */
            const next = instances[ i++ ];

            // call and delete init method and continue with next founded ccm instance (recursive call)
            next.init ? next.init().then( () => { delete next.init; init(); } ) : init();

          }

          /** calls ready methods (backward) of all founded ccm instance (recursive, asynchron) */
          function ready() {

            // all ready methods called? => perform callback
            if ( !instances.length ) return resolve();

            /**
             * last founded ccm instance with not called ready method
             * @type {ccm.types.instance}
             */
            const next = instances.pop();

            // result has a ready function? => perform and delete ready function and check next result afterwards (recursive call)
            next.ready ? next.ready().then( () => { delete next.ready; proceed(); } ) : proceed();

            /** when instance is ready */
            function proceed() {

              // does the app has to be started directly? => do it (otherwise: continue with next instance)
              if ( next._start ) { delete next._start; next.start().then( ready ); } else ready();

            }

          }

        } );

      }

    },

    /**
     * @ignore
     * @summary registers a _ccm_ component and creates a proxy instance out of it
     * @description Use this for lazy loading of a _ccm_ instance. The proxy instance turns into the real instance on first start. Required resources are also loaded only after the first start.
     * @param {ccm.types.index|ccm.types.url|ccm.types.component} component - URL of ccm component
     * @param {ccm.types.config} [config={}] - ccm instance configuration, see documentation of associated ccm component
     * @returns {Promise}
     */
    proxy: async ( component, config ) => {
      const obj = { ccm: true, component: { Instance: true } };
      obj.start = async cfg => await Object.assign( obj, await ccm.instance( component, await ccm.helper.integrate( cfg, config ) ) ).start();
      return obj;
    },

    /**
     * @summary registers a component, creates an instance out of it and starts the instance
     * @description
     * This method does the same as {@link ccm.instance} with the difference that the created [instance]{@link ccm.types.instance} is started directly.
     * See {@tutorial usage-of-components} to learn everything about _ccmjs_-based components and their instances.
     * @param {ccm.types.component_obj|string} component - component object or URL of a component file
     * @param {Object} [config] - instance configuration (check documentation of associated component to see which properties could be set)
     * @returns {Promise<ccm.types.instance>}
     * @example
     * const instance = await ccm.start( {
     *   name: 'blank',
     *   ccm: 'https://ccmjs.github.io/ccm/ccm.js',
     *   Instance: function () {
     *     this.start = async () => {
     *       this.element.innerHTML = 'Hello, World!';
     *     };
     *   }
     * }, { root: document.body } );
     * @example
     * const instance = await ccm.start(
     *   'https://ccmjs.github.io/akless-components/blank/ccm.blank.js',
     *   { root: document.body }
     * );
     * @tutorial usage-of-components
     */
    start: async ( component, config ) => {
      const instance = await ccm.instance( component, config );
      if ( !ccm.helper.isInstance( instance ) ) return instance;
      instance.init ? ( instance._start = true ) : await instance.start();
      return instance;
    },

    /**
     * @summary provides access to a datastore
     * @description
     * _ccmjs_ provides a service for data management. It could be used with this method.
     * Use the methods <code>get</code>, <code>set</code> and <code>del</code> of the result object to create, read, update or delete datasets in the datastore.
     * This method can be used to define dependencies to other datastores in [instance configurations]{@link ccm.types.instance_config}.
     * @param {Object} [config={}] - datastore accessor configuration
     * @returns {Promise<ccm.types.datastore>} datastore accessor
     * @tutorial data-management
     */
    store: ( config = {} ) => new Promise( ( resolve, reject ) => {

      // no manipulation of passed original parameter (avoids unwanted side effects)
      config = ccm.helper.clone( config );

      // is string? => use passed parameter as datastore name or path to a JavaScript file that contains initial data for local cache
      if ( typeof config === 'string' ) config = config.split( '?' ).shift().endsWith( '.js' ) ? { local: [ 'ccm.load', config ] } : { name: config };

      // is no datastore configuration? => use passed parameter for initial local cache
      if ( !ccm.helper.isObject( config ) || ( !config.local && !config.name ) ) { config = { local: config, parent: config.parent }; delete config.local.parent; }

      // no initial local cache? => use empty object
      if ( !config.local && !config.name ) config.local = {};

      // initial local cache is given as ccm dependency? => solve dependency
      ccm.helper.solveDependency( config.local ).then( result => { config.local = result;

        // local cache is given as array? => convert to object
        if ( Array.isArray( config.local ) ) config.local = ccm.helper.arrToStore( config.local );

        /**
         * created ccm datastore
         * @type {ccm.Datastore}
         */
        let store = new Datastore();

        // integrate datastore configuration
        Object.assign( store, config );

        // initialize ccm datastore and perform callback with created ccm datastore
        store.init().then( () => resolve( store ) );

      } ).catch( reject );

    } ),

    /**
     * @summary reads a dataset of a datastore
     * @description
     * This method does the same as {@link ccm.store} with the difference that a [dataset]{@link ccm.types.dataset} is directly read from the datastore.
     * The dataset is returned as result. Use this method if you only read a dataset once and then need no further access to the datastore.
     * This method can be used to define dependencies to other datasets in [instance configurations]{@link ccm.types.instance_config}.
     * In order to read only a certain subset of a dataset, the dot notation can be used in the <code>key_or_query</code> parameter.
     * Then the complete dataset is read but the result is only the requested subset.
     * If a query is passed instead of a [dataset key]{@link ccm.types.dataset_key}, several datasets can be loaded.
     * @param {Object} [config={}] - datastore accessor configuration
     * @param {ccm.types.key|Object} [key_or_query={}] - either a dataset key or a query to read several datasets (default: read all datasets)
     * @returns {Promise<ccm.types.dataset|ccm.types.dataset[]>}
     * @tutorial data-management
     */
    get: ( config = {}, key_or_query = {} ) => ccm.store( config ).then( store => {

      // support dot notation to get a specific inner value of a single dataset
      let property;
      if ( typeof key_or_query === 'string' ) {
        property = key_or_query.split( '.' );
        key_or_query = property.shift();
        property = property.join( '.' );
      }

      // request dataset in datastore
      return store.get( key_or_query ).then( result => property ? ccm.helper.deepValue( result, property ) : result );

    } ),

    /**
     * Global namespace under which each registered component can provide public data and functions to the webpage under its unique [component index]{@link ccm.types.component_index}.
     * This namespace is helpful to see which component version is already registered in which _ccmjs_ version within the webpage.
     * The namespace is usually not used by component developers.
     * @type {Object}
     * @example
     * {
     *   'chat-1-0-2': {
     *     valid: true
     *   },
     *   'quiz-1-0-0': {
     *     foo: 'bar',
     *     sayHello: name => console.log( 'Hello ' + name )
     *   },
     *   'quiz-2-1-0': {
     *     n: 5711
     *   }
     * };
     * @tutorial usage-of-components
     */
    components: {},

    /**
     * @ignore
     * @summary context functions for traversing in a _ccmjs_ context tree
     * @namespace
     * @ignore
     */
    context: {

      /**
       * @summary [deprecated] finds nearest parent that has a specific property
       * @param {ccm.types.instance} instance - starting point
       * @param {string} property - name of specific property
       * @param {boolean} not_me - exclude starting point and start with its parent
       * @returns {ccm.types.instance} property value
       */
      find: ( instance, property, not_me ) => {

        const start = instance;
        if ( not_me ) instance = instance.parent;
        do
          if ( ccm.helper.isObject( instance ) && instance[ property ] !== undefined && instance[ property ] !== start )
            return instance[ property ];
        while ( instance = instance.parent );

      },

      /**
       * @summary finds the highest parent instance that has a specific property
       * @param {ccm.types.instance} instance - starting point
       * @param {string} property - name of specific property
       * @param {boolean} not_me - exclude starting point and start with its parent
       * @returns {ccm.types.instance|null} highest parent instance that has a specific property
       */
      highestByProperty: ( instance, property, not_me ) => {

        const start = instance;
        let result = null;
        if ( not_me ) instance = instance.parent;
        if ( !instance ) return null;
        do
          if ( ccm.helper.isObject( instance ) && instance[ property ] !== undefined && instance[ property ] !== start )
            result = instance;
        while ( instance = instance.parent );
        return result;

      },

      /**
       * @summary finds the nearest parent instance that has a specific property
       * @param {ccm.types.instance} instance - starting point
       * @param {string} property - name of specific property
       * @param {boolean} not_me - exclude starting point and start with its parent
       * @returns {ccm.types.instance|null} highest parent instance that has a specific property
       */
      nearestByProperty: ( instance, property, not_me ) => {

        const start = instance;
        if ( not_me ) instance = instance.parent;
        if ( !instance ) return null;
        do
          if ( ccm.helper.isObject( instance ) && instance[ property ] !== undefined && instance[ property ] !== start )
            return instance;
        while ( instance = instance.parent );
        return null;

      },

      /**
       * @summary get _ccmjs_ context root
       * @param {ccm.types.instance} instance - _ccmjs_ instance (starting point)
       * @returns {ccm.types.instance}
       */
      root: function ( instance ) {

        while ( instance.parent )
          instance = instance.parent;

        return instance;

      }

    },

    /**
     * Contains useful help methods that can be used by component developers.
     * @namespace
     */
    helper: {

      /**
       * @summary converts an array of datasets to a collection of _ccmjs_ datasets
       * @param {ccm.types.dataset[]} arr - array of datasets
       * @returns {ccm.types.datasets} collection of _ccmjs_ datasets
       */
      arrToStore: arr => {

        if ( !Array.isArray( arr ) ) return;

        const obj = {};
        arr.forEach( value => {
          if ( ccm.helper.isDataset( value ) )
            obj[ value.key ] = value;
        } );

        return obj;
      },

      /**
       * @summary create a deep copy of a given value
       * @param {*} value - given value
       * @returns {*} deep copy of given value
       */
      clone: function ( value ) {

        return recursive( value, true );

        function recursive( value, first ) {

          if ( ccm.helper.isSpecialObject( value ) && !first ) return value;

          if ( Array.isArray( value ) || ccm.helper.isObject( value ) ) {
            var copy = Array.isArray( value ) ? [] : {};
            for ( var i in value )
              copy[ i ] = recursive( value[ i ] );
            return copy;
          }

          return value;

        }

      },

      /**
       * @summary compares two version numbers (given as string)
       * @description Version numbers must be conform with Semantic Versioning 2.0.0 ({@link http://semver.org}).
       * @param {string} a - 1st version number
       * @param {string} b - 2nd version number
       * @returns {number} -1: a < b, 0: a = b, 1: a > b
       * @example console.log( compareVersions( '8.0.1', '8.0.10' ) ); => -1
       */
      compareVersions: ( a, b ) => {

        if ( a === b ) return 0;
        const a_arr = a.split( '.' );
        const b_arr = b.split( '.' );
        for ( let i = 0; i < 3; i++ ) {
          const x = parseInt( a_arr[ i ] );
          const y = parseInt( b_arr[ i ] );
          if      ( x < y ) return -1;
          else if ( x > y ) return  1;
        }
        return 0;

      },

      /**
       * @summary extract data from the URL of a ccm component
       * @description
       * The result data contains the unique 'name', 'version' and 'index' of the component.<br>
       * The 'minified' flag is set if the filename contains a ".min".
       * @param {string} url - ccm component URL
       * @returns {{name: string, index: string, version: string, url: string, minified: boolean}} extracted data
       * @throws {Error} if component filename is not valid
       * @example
       * const data = ccm.helper.convertComponentURL( './ccm.quiz-4.0.2.js' );
       * console.log( data );  // {"name":"quiz","version":"4.0.2","index":"quiz-4-0-2","url":"./ccm.quiz-4.0.2.js"}
       * @example
       * const data = ccm.helper.convertComponentURL( './ccm.quiz.js' );  // latest version
       * console.log( data );  // {"name":"quiz","index":"quiz","url":"./ccm.quiz.js"}
       * @example
       * const data = ccm.helper.convertComponentURL( './ccm.quiz.min.js' );  // minified
       * console.log( data );  // {"name":"quiz","index":"quiz","url":"./ccm.quiz.min.js","minified":true}
       */
      convertComponentURL: url => {

        /**
         * from given url extracted filename of the ccm component
         * @type {string}
         */
        const filename = url.split( '/' ).pop();

        // abort if extracted filename is not a valid filename for a ccm component
        if ( !ccm.helper.regex( 'filename' ).test( filename ) ) throw new Error( 'invalid component filename: ' + filename );

        // extract data
        const data = { url: url };
        let tmp = filename.substring( 4, filename.length - 3 );  // remove prefix 'ccm.' and postfix '.js'
        if ( tmp.endsWith( '.min' ) ) {
          data.minified = true;
          tmp = tmp.substr( 0, tmp.length - 4 );  // removes optional infix '.min'
        }
        tmp = tmp.split( '-' );
        data.name = tmp.shift();                                                                    // name
        if ( tmp.length ) data.version = tmp[ 0 ];                                                  // version
        data.index = data.name + ( data.version ? '-' + data.version.replace( /\./g, '-' ) : '' );  // index

        return data;
      },

      /**
       * @summary get or set the value of a deeper object property
       * @param {Object} obj - object that contains the deeper property
       * @param {string} key - key path to the deeper property in dot notation
       * @param {*} [value] - value that should be set for the deeper property
       * @returns {*} value of the deeper property
       * @example
       * var obj = {
       *   test: 123,
       *   foo: {
       *     bar: 'abc',
       *     baz: 'xyz'
       *   }
       * };
       * var result = ccm.helper.deepValue( obj, 'foo.bar' );
       * console.log( result ); // => 'abc'
       * @example
       * var obj = {};
       * var result = ccm.helper.deepValue( obj, 'foo.bar', 'abc' );
       * console.log( obj );    // => { foo: { bar: 'abc' } }
       * console.log( result ); // => 'abc'
       */
      deepValue: function ( obj, key, value ) {

        return recursive( obj, key.split( '.' ), value );

        /**
         * recursive helper function, key path is given as array
         */
        function recursive( obj, key, value ) {

          if ( !obj ) return;
          var next = key.shift();
          if ( key.length === 0 )
            return value !== undefined ? obj[ next ] = value : obj[ next ];
          if ( !obj[ next ] && value !== undefined ) obj[ next ] = isNaN( key[ 0 ] ) ? {} : [];
          return recursive( obj[ next ], key, value );  // recursive call

        }

      },

      /**
       * @summary replaces placeholder in data with given values
       * @param {*} data - data with contained placeholders
       * @param {...*} [values] - given values
       * @returns {*} data with replaced placeholders
       */
      format: function ( data, values ) {

        const temp = [[],[],{}];
        const obj_mode = ccm.helper.isObject( data );

        // convert given values to real array
        values = ccm.helper.clone( [ ...arguments ] ); values.shift();

        // convert data to string
        data = ccm.helper.stringify( data, ( key, val ) => {

          // rescue all functions and replace them with special placeholder
          if ( typeof val === 'function' ) { temp[ 0 ].push( val ); return '%$0%'; }

          return val;
        } );

        // replace placeholders with values
        for ( let i = 0; i < values.length; i++ ) {

          // value is object or array? => iterate each contained value
          if ( typeof values[ i ] === 'object' ) {
            for ( const key in values[ i ] )
              if ( values[ i ].hasOwnProperty( key ) ) {

                // value is not a string and data is object?
                if ( typeof values[ i ][ key ] !== 'string' && obj_mode ) {
                  temp[ 2 ][ key ] = values[ i ][ key ];                     // rescue value
                  values[ i ][ key ] = `%$2%${key}%`;                        // replace value with special placeholder
                }

                // value is not a string? => skip replacement
                if ( typeof values[ i ][ key ] !== 'string' ) continue;

                // replace all associated placeholders with value
                data = data.replace( new RegExp( `%${key}%`, 'g' ), values[ i ][ key ].replace( /"/g, '\\"' ) );

              }
          }

          // neither object nor array
          else {

            // value is not a string and data is object? => rescue value and replace it with special placeholder
            if ( typeof values[ i ] !== 'string' && obj_mode ) {
              temp[ 1 ].push( values[ i ] );                      // rescue value
              values[ i ] = '%$1%';                               // replace value with special placeholder
            }

            // replace first occurrence of empty placeholder with value
            data = data.replace( /%%/, values[ i ].replace( /"/g, '\\"' ) );

          }

        }

        // convert data from string back to original
        return ccm.helper.parse( data, ( key, val ) => {

          // replace special placeholders with rescued values
          if ( val === '%$0%' ) return temp[ 0 ].shift();
          if ( val === '%$1%' ) return temp[ 1 ].shift();
          if ( typeof val === 'string' ) {

            // is standalone placeholder => keep original datatype
            if ( val.indexOf( '%$2%' ) === 0 && val.split( '%' )[ 3 ] === '' ) return temp[ 2 ][ val.split( '%' )[ 2 ] ];

            // placeholder is part of string? => replace (datatype is converted to string)
            else
              for ( const key in temp[ 2 ] )
                val = val.replace( new RegExp( `%\\$2%${key}%`, 'g' ), temp[ 2 ][ key ] );

          }

          return val;
        } );

      },

      /**
       * @summary generates an instance configuration out of a HTML element
       * @param {string|ccm.types.html|ccm.types.html[]|Node|jQuery} element - HTML element
       * @returns {ccm.types.config}
       */
      generateConfig: element => {

        // convert to HTML element
        element = ccm.helper.html( element, undefined, { no_evaluation: true } );

        // innerHTML is a JSON string? => move it to attribute 'inner'
        if ( ccm.helper.regex( 'json' ).test( element.innerHTML ) ) { element.setAttribute( 'inner', element.innerHTML ); element.innerHTML = ''; }

        const config = {};
        catchAttributes( element, config );
        catchInnerTags( element );
        return config;

        function catchAttributes( element, obj ) {

          if ( !element.attributes ) return;
          [ ...element.attributes ].forEach( attr => {
            if ( attr.name !== 'src' ||
              ( element.tagName.indexOf( 'CCM-COMPONENT' ) !== 0
                && element.tagName.indexOf( 'CCM-INSTANCE'  ) !== 0
                && element.tagName.indexOf( 'CCM-PROXY'     ) !== 0 ) )
              try {
                obj[ attr.name ] = attr.value.charAt( 0 ) === '{' || attr.value.charAt( 0 ) === '[' ? ccm.helper.parse( attr.value ) : prepareValue( attr.value );
              } catch ( err ) {}
          } );

        }

        function catchInnerTags( element ) {

          if ( !element.childNodes ) return;
          config.childNodes = [];
          [ ...element.childNodes ].forEach( child => {
            if ( child.tagName && child.tagName.indexOf( 'CCM-' ) === 0 ) {
              const split = child.tagName.toLowerCase().split( '-' );
              if ( split.length < 3 ) split[ 2 ] = split[ 1 ];
              switch ( split[ 1 ] ) {
                case 'load':
                  ccm.helper.deepValue( config, split[ 2 ], interpretLoadTag( child, split[ 2 ] ) );
                  break;
                case 'component':
                case 'instance':
                case 'proxy':
                  ccm.helper.deepValue( config, split[ 2 ], [ 'ccm.' + split[ 1 ], child.getAttribute( 'src' ) || split[ 2 ], ccm.helper.generateConfig( child ) ] );
                  break;
                case 'store':
                case 'get':
                  const settings = {};
                  catchAttributes( child, settings );
                  const key = settings.key;
                  delete settings.key;
                  ccm.helper.deepValue( config, split[ 2 ], [ 'ccm.' + split[ 1 ], settings, key ] );
                  break;
                case 'list':
                  let list = null;
                  [ ...child.children ].forEach( entry => {
                    if ( entry.tagName && entry.tagName.indexOf( 'CCM-ENTRY' ) === 0 ) {
                      const value = prepareValue( entry.getAttribute( 'value' ) );
                      const split = entry.tagName.toLowerCase().split( '-' );
                      if ( !list )
                        list = split.length < 3 ? [] : {};
                      if ( split.length < 3 )
                        list.push( value );
                      else
                        ccm.helper.deepValue( list, split[ 2 ], value );
                    }
                  } );
                  if ( !list ) list = {};
                  catchAttributes( child, list );
                  if ( list ) ccm.helper.deepValue( config, split[ 2 ], list );
                  break;
                default:
                  config.childNodes.push( child );
                  element.removeChild( child );
              }
            }
            else {
              config.childNodes.push( child );
              element.removeChild( child );
            }
          } );
          if ( config.inner ) return;
          config.inner = ccm.helper.html( {} );
          config.childNodes.forEach( child => config.inner.appendChild( child ) );
          delete config.childNodes;
          if ( !config.inner.hasChildNodes() ) delete config.inner;

          function interpretLoadTag( node ) {

            let params = generateParameters( node );
            if ( !Array.isArray( params ) ) params = [ params ];
            params.unshift( 'ccm.load' );
            if ( node.hasAttribute( 'head' ) ) params.push( true );
            return params;

            function generateParameters( node ) {

              if ( node.hasAttribute( 'src' ) ) {
                if ( node.children.length === 0 )
                  return node.getAttribute( 'src' );
                const data = {};
                [ ...node.children ].forEach( child => {
                  if ( child.tagName && child.tagName.indexOf( 'CCM-DATA-' ) === 0 )
                    data[ child.tagName.toLowerCase().split( '-' )[ 2 ] ] = child.getAttribute( 'value' );
                } );
                return [ node.getAttribute( 'src' ), data ];
              }
              const params = [];
              [ ...node.children ].forEach( child => {
                if ( child.tagName === 'CCM-SERIAL' && ( node.tagName === 'CCM-PARALLEL' || node.tagName.indexOf( 'CCM-LOAD' ) === 0 )
                    || child.tagName === 'CCM-PARALLEL' && node.tagName === 'CCM-SERIAL' )
                  params.push( generateParameters( child ) );
              } );
              return params;

            }

          }

        }

        function prepareValue( value ) {
          if ( value === 'true'      ) return true;
          if ( value === 'false'     ) return false;
          if ( value === 'null'      ) return null;
          if ( value === 'undefined' ) return undefined;
          if ( value === ''          ) return true;
          if ( !isNaN( value )       ) return parseInt( value );
          return value;
        }

      },

      /**
       * @summary generates a unique key
       * @description
       * An automatic generated unique key is made up of three parts.
       * The first part is the current time in milliseconds.
       * The second part is an 'X' as separator between first and last part.
       * The last part is a random number.
       * @returns {ccm.types.key} unique key
       * @example console.log( ccm.helper.generateKey() );  // 1465718738384X6869462723575014
       */
      generateKey: function () {

        return crypto.randomUUID();

      },

      /**
       * transforms HTML to a HTML element and replaces placeholders (recursive)
       * @param {string|ccm.types.html|ccm.types.html[]|Node|jQuery|function} html
       * @param {...string|Object} [values] - values to replace placeholder
       * @param {Object} [settings={}] - advanced settings
       * @param {boolean} [settings.no_evaluation] - skips evaluation of ccm HTML elements
       * @param {string} [settings.namespace_uri] - sets namespace URI for created elements
       * @returns {Element|Element[]} HTML element
       */
      html: function ( html, ...values ) {

        // no HTML or is instance? => let it be
        if ( !html || ccm.helper.isInstance( html ) ) return html;

        // is already a HTML element and no placeholders have to be replaced? => nothing to do
        if ( ccm.helper.isElement( html ) && !values.length ) return html;

        // is function that returns a lit-html template result?
        if ( typeof html === 'function' ) return html.apply( this, values );

        // handle advanced settings
        let advanced = {};
        if ( values.length > 1 && ccm.helper.isObject( values[ values.length - 1 ] ) ) {
          advanced = values.pop();
          if ( values[ 0 ] === undefined ) values.shift();
        }

        // convert HTML to ccm HTML data
        html = ccm.helper.html2json( html );

        // clone HTML data
        html = ccm.helper.clone( html );

        // replace placeholder
        if ( values.length ) {
          values.unshift( html );
          html = ccm.helper.format.apply( this, values );
        }

        // get more than one HTML tag?
        if ( Array.isArray( html ) ) {

          // generate each HTML tag
          const result = [];
          for ( let i = 0; i < html.length; i++ )
            result.push( ccm.helper.html( html[ i ], undefined, advanced ) );  // recursive call
          return result;

        }

        // get no ccm html data? => return parameter value
        if ( typeof html !== 'object' || html === null ) html = { tag: 'span', inner: html };

        // is SVG? => create elements with the SVG namespace URI
        if ( html.tag === 'svg' ) advanced.namespace_uri = 'http://www.w3.org/2000/svg';

        /**
         * HTML tag
         * @type {Element}
         */
        const element = advanced.namespace_uri ? document.createElementNS( advanced.namespace_uri, html.tag || 'div' ) : document.createElement( html.tag || 'div' );

        // remove 'tag' and 'key' property
        delete html.tag; if ( !ccm.helper.regex( 'json' ).test( html.key ) ) delete html.key;

        // iterate over ccm html data properties
        for ( const key in html ) {

          /**
           * value of ccm html data property
           * @type {string|ccm.types.html|Array}
           */
          const value = html[ key ];

          // interpret ccm html data property
          switch ( key ) {

            // HTML boolean attributes
            case 'async':
            case 'autofocus':
            case 'defer':
            case 'disabled':
            case 'ismap':
            case 'multiple':
            case 'required':
            case 'selected':
              if ( value ) element[ key ] = true;
              break;
            case 'checked':
              if ( value ) {
                element[ key ] = true;
                element.setAttribute( key, '' );
              }
              break;
            case 'readonly':
              if ( value ) element.readOnly = true;
              break;

            // inner HTML
            case 'inner':
              if ( typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ) { element.innerHTML = value; break; }
              let children = Array.isArray( value ) ? value : [ value ];
              children.forEach( child => element.appendChild( this.html( child, undefined, advanced ) ) );
              break;

            // HTML value attributes and events
            default:
              if ( key.indexOf( 'on' ) === 0 && typeof value === 'function' )               // is HTML event
                element.addEventListener( key.substr( 2 ), value );
              else                                                                          // is HTML value attribute
                element.setAttribute( key, value );
          }

        }

        // is ccm HTML Element of registered component and evaluation is not skipped? => evaluate ccm HTML Element
        if ( element.tagName.startsWith( 'CCM-' ) && !advanced.no_evaluation ) {
          const config = ccm.helper.generateConfig( element );
          config.root = element;
          ( config.ccm && config.ccm !== 'latest' ? window.ccm[ config.ccm ] : window.ccm ).start( element.tagName === 'CCM-APP' ? element.getAttribute( 'component' ) : element.tagName.substr( 4 ).toLowerCase(), config );
        }

        // return generated HTML
        return element;

      },

      /**
       * converts HTML to JSON
       * @param {string|jQuery|DocumentFragment|Element|ccm.types.html} html
       * @returns {ccm.types.html} ccm HTML data
       */
      html2json: html => {

        /**
         * ccm HTML data
         * @type {Object}
         */
        const json = { inner: [] };

        // is HTML string? => convert to document fragment
        if ( typeof html === 'string' ) {
          const template = document.createElement( 'template' );
          template.innerHTML = html;
          html = template.content;
        }

        // is jQuery element? => convert to document fragment
        if ( window.jQuery && html instanceof jQuery ) {
          html = html.get();
          const fragment = document.createDocumentFragment();
          html.forEach( elem => fragment.appendChild( elem ) );
          html = fragment;
        }

        // is document fragment?
        if ( html instanceof DocumentFragment ) {

          // content is only text? => return text as result
          if ( !html.children.length ) return html.textContent;

          // remove whitespaces, comments and empty text nodes
          [ ...html.childNodes ].forEach( child => {
            if ( child.nodeValue ) {
              child.nodeValue = child.nodeValue.trim();
              if ( !child.nodeValue || child.nodeType === Node.COMMENT_NODE ) child.parentNode.removeChild( child );
            }
          } );

          // only one child? => use child as root element
          if ( html.childNodes.length === 1 )
            html = html.firstChild;

        }

        // no HTML Element? => return it as result
        if ( !ccm.helper.isElement( html ) ) return html;

        // catch tag name
        if ( html.tagName ) json.tag = html.tagName.toLowerCase();
        if ( json.tag === 'div' ) delete json.tag;

        // catch HTML attributes
        html.attributes && [ ...html.attributes ].forEach( attr => json[ attr.name ] = attr.value === '' && attr.name !== 'value' ? true : attr.value );

        // catch inner HTML (recursive)
        [ ...html.childNodes ].forEach( child => {
          if ( child.nodeType === Node.COMMENT_NODE )
            return child.parentNode.removeChild( child );
          if ( child.nodeValue && !child.parentElement?.closest( 'pre' ) )
            child.nodeValue = child.nodeValue.replace( /\s+/g, ' ' );
          if ( ccm.helper.isElement( child ) || child.nodeValue.trim() )
            json.inner.push( ccm.helper.isElement( child ) ? ccm.helper.html2json( child ) : child.textContent );
        } );
        if ( !json.inner.length )
          delete json.inner;
        else if ( json.inner.length === 1 )
          json.inner = json.inner[ 0 ];

        return json;
      },

      /**
       * @summary integrates priority data into a given dataset
       * @description
       * Each value of each property in the given priority data will be set in the given dataset for the property of the same name.
       * This method also supports dot notation in given priority data to set a single deeper property in the given dataset.
       * With no given priority data, the result is the given dataset.
       * With no given dataset, the result is the given priority data.
       * Any data dependencies are resolved before integration.
       * @param {Object} [priodata] - priority data
       * @param {Object} [dataset] - dataset
       * @param {boolean} [as_defaults] - integrate values only if not already exist
       * @returns {Object} dataset with integrated priority data
       * @example
       * const dataset  = { firstname: 'John', lastname: 'Doe', fullname: 'John Doe' };
       * const priodata = { lastname: 'Done', fullname: undefined };
       * const result = await ccm.helper.integrate( priodata, dataset );
       * console.log( result );  // { firstname: 'John', lastname: 'Done', fullname: undefined };
       * @example
       * const result = await ccm.helper.integrate( { 'foo.c': 'z' }, { foo: { a: 'x', b: 'y' } } );
       * console.log( result );  // { foo: { a: 'x', b: 'y', c: 'z' } }
       * @example
       * const result = await ccm.helper.integrate( { value: 'foo' } );
       * console.log( result );  // { value: 'foo' }
       * @example
       * const result = await ccm.helper.integrate( undefined, { value: 'foo' } );
       * console.log( result );  // { value: 'foo' }
       * @example
       * const store = { data: { key: 'data', foo: 'bar' } };
       * const result = await ccm.helper.integrate( { 'value.foo': 'baz' }, { value: [ 'ccm.get', { local: store }, 'data' ] } );
       * console.log( result );  // { value: { foo: 'baz' } }
       */
      integrate: async ( priodata, dataset, as_defaults ) => {

        dataset = ccm.helper.clone( dataset );

        // no given priority data? => return given dataset
        if ( !ccm.helper.isObject( priodata ) ) return dataset;

        // no given dataset? => return given priority data
        if ( !ccm.helper.isObject( dataset ) ) return ccm.helper.clone( priodata );

        // iterate over priority data properties
        for ( let key in priodata ) {

          // search and solve data dependencies along key path before integration of priority data value
          const split = key.split( '.' );
          let obj = dataset;
          for ( let i = 0; i < split.length; i++ ) {
            const prop = split[ i ];
            if ( ccm.helper.isDependency( obj[ prop ] ) && obj[ prop ][ 0 ] === 'ccm.get' )
              obj[ prop ] = await ccm.helper.solveDependency( obj[ prop ] );
            obj = obj[ prop ];
            if ( !obj ) break;
          }

          // set value for the same property in the given dataset
          const value = ccm.helper.deepValue( dataset, key );
          if ( !as_defaults || value === undefined || value === '' ) ccm.helper.deepValue( dataset, key, priodata[ key ] );

        }

        // return dataset with integrated priority data
        return dataset;

      },

      /**
       * @summary check value for _ccmjs_ component
       * @param {*} value - value to check
       * @returns {boolean}
       */
      isComponent: function ( value ) {

        return ccm.helper.isObject( value ) && value.Instance && true;

      },

      /**
       * checks if a value is a ccm dataset
       * @param {*} value - value to check
       * @returns {boolean}
       */
      isDataset: value => ccm.helper.isObject( value ) && ccm.helper.isKey( value.key ),

      /**
       * checks if a value is a ccm datastore object
       * @param {*} value - value to check
       * @returns {boolean}
       */
      isDatastore: value => ccm.helper.isObject( value ) && value.get && value.set && value.del && value.source && value.clear && true,

      /**
       * check value if it is a _ccmjs_ dependency
       * @param {*} value
       * @returns {boolean}
       * @example [ ccm.load, ... ]
       * @example [ ccm.component, ... ]
       * @example [ ccm.instance, ... ]
       * @example [ ccm.proxy, ... ]
       * @example [ ccm.start, ... ]
       * @example [ ccm.store, ... ]
       * @example [ ccm.get, ... ]
       * @example [ ccm.set, ... ]
       * @example [ ccm.del, ... ]
       */
      isDependency: function ( value ) {

        if ( Array.isArray( value ) )
          if ( value.length > 0 )
            switch ( value[ 0 ] ) {
              case 'ccm.load':
              case 'ccm.component':
              case 'ccm.instance':
              case 'ccm.proxy':
              case 'ccm.start':
              case 'ccm.store':
              case 'ccm.get':
              case 'ccm.set':
              case 'ccm.del':
                return true;
            }

        return false;

      },

      /**
       * @summary check value for HTML element node
       * @param {*} value - value to check
       * @returns {boolean}
       */
      isElement: function ( value ) {

        return value instanceof Element || value instanceof DocumentFragment;
        //return self.helper.isNode( value ) && value.tagName && true;

      },

      /**
       * @summary checks if a value is a _ccmjs_ ccmjs object
       * @param {*} value - value to check
       * @returns {boolean}
       */
      isCore: value => ccm.helper.isObject( value ) && value.components && value.version && true,

      /**
       * @summary checks if a value is a _ccmjs_ instance
       * @param {*} value - value to check
       * @returns {boolean}
       */
      isInstance: value => ccm.helper.isObject( value ) && ccm.helper.isComponent( value.component ) && value.ccm && true,

      /**
       * checks if a value is a valid ccm dataset key
       * @param {*} value - value to check
       * @returns {boolean}
       */
      isKey: value => {

        // value is a string? => check if it is an valid key
        if ( typeof value === 'string' || typeof value === 'number' ) return ccm.helper.regex( 'key' ).test( value );

        // value is an array? => check if it is an valid array key
        if ( Array.isArray( value ) ) {
          for ( let i = 0; i < value.length; i++ )
            if ( !ccm.helper.regex( 'key' ).test( value[ i ] ) )
              return false;
          return true;
        }

        // value is not a dataset key? => not valid
        return false;

      },

      /**
       * @summary check value for HTML node
       * @param {*} value - value to check
       * @returns {boolean}
       */
      isNode: function ( value ) {

        return value instanceof Node;

      },

      /**
       * check value if it is an object (including not null and not array)
       * @param {*} value - value to check
       * @returns {boolean}
       */
      isObject: function ( value ) {

        return typeof value === 'object' && value !== null && !Array.isArray( value );

      },

      /**
       * @summary checks if a value is an ccm proxy instance
       * @param {*} value - value to check
       * @returns {boolean}
       */
      isProxy: function ( value ) {

        return ccm.helper.isInstance( value ) && value.component === true;

      },

      /**
       * @summary checks if a value is a special object: (Window Object, Node, ccmjs Object, ccm Instance, ccm Component Object, ccm Datastore, jQuery Object)
       * @param {*} value
       * @returns {boolean}
       */
      isSpecialObject: value => {

        return !!( value === window || ccm.helper.isNode( value ) || ccm.helper.isCore( value ) || ccm.helper.isInstance( value ) || ccm.helper.isComponent( value ) || ccm.helper.isDatastore( value ) || window.jQuery && value instanceof jQuery );

      },

      /**
       * checks if an object is a subset of another object
       * @param {Object} obj - object
       * @param {Object} other - another object
       * @returns {boolean}
       * @example
       * const obj = {
       *   name: 'John Doe',
       *   counter: 3,
       *   isValid: true,
       *   x: { y: 'z' },                 // check of inner object
       *   'values.1': 123,               // check of deeper array value
       *   'settings.title': 'Welcome!',  // check of deeper object value
       *   onLoad: true,                  // checks for truthy (is not falsy)
       *   search: 'foo,bar,baz'          // checks with regular expression
       * };
       * const other = {
       *   name: 'John Doe',
       *   counter: 3,
       *   isValid: true,
       *   values: [ 'abc', 123, false ],
       *   settings: { title: 'Welcome!', year: 2017, greedy: true },
       *   x: { y: 'z' },
       *   onLoad: function () { console.log( 'Loading..' ); },
       *   search: 'foo,bar,baz'
       * };
       * const result = isSubset( obj, other );
       * console.log( result );  // => true
       */
      isSubset( obj, other ) {

        for ( const key in obj )
          if ( obj[ key ] === null ) {
            if ( other[ key ] !== undefined )
              return false;
          }
          else if ( obj[ key ] === true ) {
            if ( !other[ key ] )
              return false;
          }
          else if ( typeof obj[ key ] === 'string' && obj[ key ].startsWith( '/' ) && obj[ key ].endsWith( '/' ) ) {
            if ( !new RegExp( obj[ key ].slice( 1, -1 ) ).test( other[ key ] && typeof other[ key ] === 'object' ? other[ key ].toString() : other[ key ] ) )
              return false;
          }
          else if ( typeof obj[ key ] === 'object' && typeof other[ key ] === 'object' ) {
            if ( JSON.stringify( obj[ key ] ) !== JSON.stringify( other[ key ] ) )
              return false;
          }
          else if ( key.includes( '.' ) ) {
            if ( ccm.helper.deepValue( other, key ) !== obj[ key ] )
              return false;
          }
          else if ( obj[ key ] !== other[ key ] )
            return false;
        return true;

      },

      /**
       * loads a ccmjs version
       * @param {string|{url: string, integrity: string, crossorigin: string}} url - ccmjs version URL
       * @returns {Promise<Object>} namespace of loaded ccmjs version
       */
      loadVersion: async url => {

        // prepare resource data
        let resource = {};
        if ( ccm.helper.isObject( url ) ) {
          url = ccm.helper.clone( url );
          resource.url = url.url;
          delete url.url;
          resource.attr = url;
        }
        else resource = { url: url };

        /**
         * ccmjs version number
         * @type {string}
         */
        const version = ( resource.url.match( /(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)/ ) || [ '' ] )[ 0 ];

        // load needed ccmjs version if not already there
        version && !window.ccm[ version ] && await ccm.load( resource );

        return version ? window.ccm[ version ] : window.ccm;
      },

      /**
       * returns a _ccmjs_ loading icon
       * @param {Object} [instance] - _ccmjs_ instance (for determining Shadow DOM)
       * @returns {Element} _ccmjs_ loading icon
       * @example document.body.appendChild( loading() )
       * @example document.body.appendChild( loading( instance ) )
       */
      loading: instance => {

        // set keyframe for ccm loading icon animation
        let element = instance ? instance.element.parentNode : document.head;
        if ( !element.querySelector( '#ccm_keyframe' ) ) {
          const style = document.createElement( 'style' );
          style.id = 'ccm_keyframe';
          style.appendChild( document.createTextNode( '@keyframes ccm_loading { to { transform: rotate( 360deg ); } }' ) );
          element.appendChild( style );
        }

        // create loading icon
        element = document.createElement( 'div' );
        element.classList.add( 'ccm_loading' );
        element.setAttribute( 'style', 'display: grid; padding: 0.5em;' );
        element.innerHTML = '<div style="align-self: center; justify-self: center; display: inline-block; width: 2em; height: 2em; border: 0.3em solid #f3f3f3; border-top-color: #009ee0; border-left-color: #009ee0; border-radius: 50%; animation: ccm_loading 1.5s linear infinite;"></div>';

        return element;
      },

      /**
       * logs a ccm-specific message in the browser console
       * @param {*} message
       */
      log: message => console.log( '[ccmjs]', message ),

      /**
       * converts a JSON string to JSON and removes hidden characters
       * @param {string} string - JSON string
       * @param {Function} [reviver]
       * @returns {*} JSON
       */
      parse: ( string, reviver ) => JSON.parse( string
        .replace( /\\n/g, "\\n" )
        .replace( /\\'/g, "\\'" )
        .replace( /\\"/g, '\\"' )
        .replace( /\\&/g, "\\&" )
        .replace( /\\r/g, "\\r" )
        .replace( /\\t/g, "\\t" )
        .replace( /\\b/g, "\\b" )
        .replace( /\\f/g, "\\f" )
        .replace( /[\u0000-\u0019]+/g, "" ), reviver
      ),

      /**
       * @summary get a _ccmjs_ relevant regular expression
       * @description
       * Possible index values, it's meanings and it's associated regular expressions:
       * <table>
       *   <tr>
       *     <th>index</th>
       *     <th>meaning</th>
       *     <th>regular expression</th>
       *   </tr>
       *   <tr>
       *     <td><code>'filename'</code></td>
       *     <td>filename for an _ccmjs_ instance</td>
       *     <td>/^(ccm.)?([^.-]+)(-(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*))?(\.min)?(\.js)$/</td>
       *   </tr>
       *   <tr>
       *     <td><code>'key'</code></td>
       *     <td>key for a _ccmjs_ dataset</td>
       *     <td>/^[a-z_0-9][a-zA-Z_0-9]*$/</td>
       *   </tr>
       * </table>
       * @param {string} index - index of the regular expression
       * @returns {RegExp} RegExp Object
       * @example
       * // test if a given string is a valid filename for an ccm component
       * var string = 'ccm.dummy-3.2.1.min.js';
       * var result = ccm.helper.regex( 'filename' ).test( string );
       * console.log( result );  // => true
       * @example
       * // test if a given string is a valid key for a ccm dataset
       * var string = 'dummy12_Foo3';
       * var result = ccm.helper.regex( 'key' ).test( string );
       * console.log( result );  // => true
       */
      regex: function ( index ) {

        switch ( index ) {
          case 'filename': return /^ccm\.([a-z][a-z_0-9]*)(-(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*))?(\.min)?(\.js)$/;
          case 'key':      return /^[a-zA-Z0-9_-]+$/;
          case 'json':     return /^(({(.|\n)*})|(\[(.|\n)*])|true|false|null)$/;
        }

      },

      /**
       * @summary sets observed responsive breakpoints for an element
       * @param {Element} element
       * @param {Object} [breakpoints = { SM: 384, MD: 576, LG: 768, XL: 960 }]
       * @param {Object} [instance] - ccm instance with an 'onbreakpoint' callback
       */
      responsive: ( element, breakpoints = { SM: 384, MD: 576, LG: 768, XL: 960 }, instance ) => {

        let init = true;
        if ( window.ResizeObserver )
          new ResizeObserver( updateBreakpoints ).observe( element );
        else {
          const observer = new MutationObserver( mutations => mutations.forEach( mutation => mutation.type === 'attributes' && mutation.attributeName === 'style' && updateBreakpoints() ) );
          observer.observe( element, { attributes: true } );
          document.body.querySelectorAll( '*' ).forEach( element => observer.observe( element, { attributes: true } ) );
          window.addEventListener( 'resize', updateBreakpoints, false );
          updateBreakpoints();
        }

        function updateBreakpoints() {
          const before = element.getAttribute( 'class' );
          for ( const key in breakpoints )
            element.classList[ element.offsetWidth >= breakpoints[ key ] ? 'add' : 'remove' ]( key );
          const after = element.getAttribute( 'class' );
          !init && before !== after && instance.onbreakpoint && instance.onbreakpoint( breakpoints[ after.split( ' ' ).pop() ] || 0 );
          init = false;
        }

      },

      /**
       * @summary solves ccm dependencies contained in an object or array
       * @param {Object|Array} obj - object or array
       * @param {ccm.types.instance} [instance] - associated ccm instance
       * @returns {Promise}
       */
      solveDependencies: ( obj, instance ) => new Promise( ( resolve, reject ) => {

        obj = ccm.helper.clone( obj );
        if ( !ccm.helper.isObject( obj ) && !Array.isArray( obj ) ) return resolve( obj );
        let failed = false;
        let counter = 1;
        search( obj );
        check();

        function search( obj ) {
          if ( ccm.helper.isSpecialObject( obj ) ) return;
          for ( const key in obj )
            if ( obj.hasOwnProperty( key ) )
              if ( key !== 'ignore' ) {
                const value = obj[ key ];
                if ( ccm.helper.isDependency( value ) ) {
                  counter++;
                  ccm.helper.solveDependency( obj[ key ], instance )
                    .then ( result => {                obj[ key ] = result; check(); } )
                    .catch( result => { failed = true; obj[ key ] = result; check(); } );
                }
                else if ( ccm.helper.isObject( value ) || Array.isArray( value ) )
                  search( value );
              }
        }

        function check() { !--counter && ( failed ? reject : resolve )( obj ); }

      } ),

      /**
       * @summary solves a ccm dependency
       * @param {Array} dependency - ccm dependency
       * @param {ccm.types.instance} [instance] - associated ccm instance
       * @returns {Promise}
       */
      solveDependency: async ( dependency, instance ) => {

        // given value is no ccm dependency? => result is given value
        if ( !ccm.helper.isDependency( dependency ) ) return dependency;

        // prevent changes via original reference
        dependency = ccm.helper.clone( dependency );

        /**
         * ccm operation to be performed
         * @type {string}
         */
        const operation = dependency.shift().substr( 'ccm.'.length );

        // solve dependency
        switch ( operation ) {
          case 'load':
            instance && setContext( dependency );
            return await ccm.load.apply( null, dependency );
          case 'component':
          case 'instance':
          case 'proxy':
          case 'start':
          case 'set':
          case 'del':
            dependency[ 1 ] = await ccm.helper.solveDependency( dependency[ 1 ], instance );
            if ( !dependency[ operation === 'store' ? 0 : 1 ] ) dependency[ operation === 'store' ? 0 : 1 ] = {};
            if ( instance ) dependency[ operation === 'store' ? 0 : 1 ].parent = instance;
            return await ccm[ operation ].apply( null, dependency );
          case 'store':
          case 'get':
            if ( !dependency[ 0 ] ) dependency[ 0 ] = {};
            if ( instance ) dependency[ 0 ].parent = instance;
            return await ccm[ operation ].apply( null, dependency );
        }

        /**
         * load resources in Shadow DOM of given ccm instance
         * @param {Array} resources
         */
        function setContext( resources ) {
          for ( let i = 0; i < resources.length; i++ ) {
            if ( Array.isArray( resources[ i ] ) ) { setContext( resources[ i ] ); continue; }
            if ( !ccm.helper.isObject( resources[ i ] ) ) resources[ i ] = { url: resources[ i ] };
            if ( !resources[ i ].context ) resources[ i ].context = instance.element.parentNode;
          }
        }

      },

      /**
       * transforms a flat object which has dot notation in it's keys as path to deeper properties to an object with deeper structure (not yet uses in ccmjs)
       * @param {Object} obj
       * @returns {Object}
       */
      solveDotNotation: function ( obj ) {

        obj = ccm.helper.clone( obj );
        for ( const key in obj )
          if ( key.indexOf( '.' ) !== -1 ) {
            ccm.helper.deepValue( obj, key, obj[ key ] );
            delete obj[ key ];
          }
        return obj;

      },

      /**
       * converts a value to a JSON string and removes not JSON valid data
       * @param {*} value
       * @param {Function} [replacer]
       * @param {string|number} [space]
       * @returns {string} JSON string
       */
      stringify: ( value, replacer, space ) => JSON.stringify( value, ( key, value ) => {
        if ( typeof value === 'function' || ccm.helper.isSpecialObject( value ) )
          value = null;
        return replacer ? replacer( key, value ) : value;
      }, space ),

      /**
       * transforms an object with deeper structure to a flat object with dot notation in each key as path to deeper properties
       * @param {Object} obj - object
       * @param {boolean} [all_levels] - result contains all levels of dot notation
       * @returns {Object}
       */
      toDotNotation: function ( obj, all_levels ) {

        const result = {};
        recursive( obj, '' );
        return result;

        function recursive( obj, prefix ) {

          for ( const key in obj ) {
            if ( typeof obj[ key ] === 'object' && !ccm.helper.isSpecialObject( obj[ key ] ) ) {
              if ( all_levels ) result[ prefix + key ] = obj[ key ];
              recursive( obj[ key ], prefix + key + '.' );
            }
            else
              result[ prefix + key ] = obj[ key ];
          }

        }

      },

      /**
       * converts a value to valid JSON (removes not JSON valid data like functions, special objects and hidden characters)
       * @param {*} value
       * @returns {*} valid JSON
       */
      toJSON: value => ccm.helper.parse( ccm.helper.stringify( value ) )

    },

    /**
     * Timeout limit (in ms) for a resource loaded via {@link ccm.load} (default: no timeout).
     * @type {number}
     * @tutorial loading-of-resources
     */
    timeout: 0

  };

  // set ccmjs version specific namespace
  if ( ccm.version && !window.ccm[ ccm.version() ] ) window.ccm[ ccm.version() ] = ccm;

  // update namespace for latest ccmjs version
  if ( !window.ccm.version || ccm.helper.compareVersions( ccm.version(), window.ccm.version() ) > 0 ) Object.assign( window.ccm, ccm.helper.clone( ccm ) );

  // define Custom Element <ccm-app>
  defineCustomElement( 'app' );

  /**
   * defines a ccm-specific Custom Element
   * @param {string} name - element name (without 'ccm-' prefix)
   * @returns {Promise<void>}
   */
  async function defineCustomElement( name ) {

    // load polyfill for Custom Elements
    if ( !( 'customElements' in window ) ) await ccm.load( {
      url: 'https://ccmjs.github.io/ccm/polyfills/webcomponents-lite.js',
      attr: {
        integrity: 'sha384-yEuTKRGFLhOAfHNxaZiiI23KhMelYudrPUNSUK6T5u1+deGEEKsQ89cS0sPIHjyj',
        crossorigin: 'anonymous'
      }
    } );

    if ( customElements.get( 'ccm-' + name ) ) return;
    window.customElements.define( 'ccm-' + name, class extends HTMLElement {
      async connectedCallback() {
        if ( !document.body.contains( this ) ) return;
        let node = this;
        while ( node = node.parentNode )
          if ( node.tagName && node.tagName.indexOf( 'CCM-' ) === 0 )
            return;
        const config = ccm.helper.generateConfig( this );
        config.root = this;
        await ( config.ccm && config.ccm !== 'latest' ? window.ccm[ config.ccm ] : window.ccm ).start( this.tagName === 'CCM-APP' ? config.component : name, config );
      }
    } );

  }

  /**
   * prepares a ccm instance configuration
   * @param {Object} [config={}] - instance configuration
   * @param {Object} [defaults={}]  - default instance configuration from component object
   * @returns {Promise}
   */
  async function prepareConfig( config={}, defaults={} ) {

    // config is given as ccm dependency? => solve it
    config = await ccm.helper.solveDependency( config );

    // starting point is default instance configuration from component object
    let result = defaults;

    // integrate source configuration(s)
    const recursive = async config => {
      if ( !config.src ) return;
      let source = await ccm.helper.solveDependency( config.src );
      delete config.src;
      await recursive( source );
      result = await ccm.helper.integrate( source, result );
    };
    await recursive( config );

    // integrate instance configuration
    result = await ccm.helper.integrate( config, result );

    // delete reserved properties
    delete result.component;

    return result;
  }

  /**
   * changes the component used ccmjs version via config
   * @returns {Promise<void>}
   */
  async function changeVersion( component, config ) {

    // should use other ccmjs version? => change used ccmjs version in component object
    const source = ( config && config.ccm ) || ( component.config && component.config.ccm );
    if ( source ) {
      component.ccm = source === 'latest' ? window.ccm : window.ccm[ source ] || window.ccm[ ( await ccm.helper.loadVersion( source ) ).version() ];
      component.ccm.url = ccm.helper.isObject( source ) ? source.url : source;        // (considers backward compatibility)
      config && delete config.ccm; component.config && delete component.config.ccm
    }

  }

  /*
   * @typedef {Function|string|Array} ccm.types.action
   * @summary _ccmjs_ action data
   * @example function() { ... }
   * @example functionName
   * @example 'functionName'
   * @example 'my.namespace.functionName'
   * @example ['my.namespace.functionName','param1','param2']
   */

  /*
   * @typedef {ccm.types.action} ccm.types.dependency
   * @summary _ccmjs_ dependency
   * @example [ ccm.component, 'ccm.chat.js' ]
   * @example [ ccm.instance, 'ccm.chat.js' ]
   * @example [ ccm.start, 'ccm.chat.js' ]
   * @example [ ccm.load, 'style.css' ]
   * @example [ ccm.store, { local: 'datastore.json' } ]
   * @example [ ccm.get, { local: 'datastore.json' }, 'test' ]
   * @example [ ccm.set, { local: 'datastore.json' }, { key: 'test', foo: 'bar' } ]
   * @example [ ccm.del, { local: 'datastore.json' }, 'test' ]
   */

  /*
   * @typedef {Object} ccm.types.html
   * @summary _ccmjs_ html data - TODO: explain properties of _ccmjs_ html data
   * @ignore
   */

  /*
   * @typedef {Object} ccm.types.settings
   * @summary _ccmjs_ datastore settings
   * @description
   * Settings for a _ccmjs_ datastore.
   * For more informations about providing a _ccmjs_ datastore see the [documentation of the method 'ccm.store']{@link ccm.store}.
   * The data level in which the stored datasets will managed is dependent on the existing properties in the datastore settings.
   * No property 'store' results in a _ccmjs_ datastore of data level 1.
   * An existing property 'store' results in a _ccmjs_ datastore of data level 2.
   * An existing property 'store' and 'url' results in a _ccmjs_ datastore of data level 3.
   * @property {ccm.types.datasets|ccm.types.url} local - Collection of initial _ccmjs_ datasets or URL to a json file that deliver initial datasets for local cache.
   * See [this wiki page]{@link https://github.com/akless/ccm-developer/wiki/Data-Management#data-caching} for more informations about this kind of data caching.
   * @property {string} store - Name of the datastore in the database.
   * Dependent on the specific database the datastore has different designations.
   * For example in IndexedDB this is the name of the Object Store, in MongoDB the name of the Document Store and in MySQL the name of the Table.
   * This property is not relevant for the first data level. It is only relevant for higher data levels.
   * @property {string} url - URL to an _ccmjs_ compatible server interface.
   * This property is only relevant for the third data level.
   * See [this wiki page]{@link https://github.com/akless/ccm-developer/wiki/Data-Management#server-interface} for more informations about an _ccmjs_ compatible server interface.
   * @property {string} db - database (in case of a server that offers more than one database)
   * @property {Function} onchange - Callback when server informs about changed stored datasets.
   * This property is only relevant for the third data level with real-time communication.
   * See [this wiki page]{@link https://github.com/akless/ccm-developer/wiki/Data-Management#real-time-communication} for more informations.
   * @property {ccm.types.instance} user - _ccmjs_ instance for user authentication (not documented yet) | TODO: Wiki page for datastore security
   * @example
   * // provides a empty ccm datastore of data level 1
   * {}
   * @example
   * // provides a ccm datastore of data level 1 with initial datasets from a JSON file
   * {
   *   local: 'templates.json'
   * }
   * @example
   * // same example but cross domain
   * {
   *   local: 'http://akless.github.io/ccm-developer/resources/chat/templates.json'
   * }
   * // cross domain only works if json file looks like this: ccm.callback[ 'templates.json' ]( {...} );
   * @example
   * // provides a ccm datastore of data level 1 with directly given initial datasets
   * {
   *   local: {
   *     "demo": {
   *       "key": "demo",
   *       "text": "Hello, World!",
   *       "value": "4711"
   *     },
   *     "test": {
   *       "key": "test",
   *       "text": "My test dataset.",
   *       "value": "abc"
   *     }
   *   }
   * }
   * @example
   * // provides a ccm datastore of data level 2
   * {
   *   store: 'chat'
   * }
   * @example
   * // provides a ccm datastore of data level 3 using HTTP
   * {
   *   store: 'chat',                              // The file interface.php must be
   *   url: 'http://path/to/server/interface.php'  // an ccm compatible server interface
   * }
   * @example
   * // provides a ccm realtime datastore of data level 3 using WebSocket
   * {
   *   store: 'chat',                              // The file interface.php must be
   *   url: 'ws://path/to/server/interface.php',   // an ccm compatible server interface
   *   onchange: function () {
   *     console.log( arguments );  // Shows the server informations about changed
   *   }                            // stored datasets in the developer console.
   * }
   */

  /*
   * @callback ccm.types.storeResult
   * @summary callback when a provided datastore is ready for use
   * @param {ccm.Datastore} store - _ccmjs_ datastore
   * @example function ( store ) { console.log( store ) }
   */

} )();

/**
 * @namespace ccm.types
 * @description _ccmjs_-specific type definitions
 */

/**
 * @typedef {string} ccm.types.component_index
 * @description Each _ccmjs_ component has an unique component index that is made up of a [component name]{@link ccm.types.component_name} and a [version index]{@link ccm.types.version_index} separated with a <code>-</code>.
 * @example 'blank-1-0-0'
 * @example 'chat-2-1-3'
 * @example 'blank'  // no version number means latest version
 * @example 'chat'
 */

/**
 * @typedef {string} ccm.types.component_name
 * @description Each _ccm_ component has an unique component name. The name must be conform with the regular expression <code>/^[a-z][a-z_0-9]*$/</code>.
 * @example 'blank'
 * @example 'chat'
 * @example 'my_blank'
 * @example 'chat2'
 * @example 'bank_001'
 */

/**
 * @typedef {Object} ccm.types.component_obj
 * @description
 * A component is represented as a JavaScript object within _ccmjs_. Below you see the typically properties.
 * <code>name</code>, <code>version</code>, <code>config</code>, <code>Instance</code> and <code>ready</code> are set by the component developer.
 * <code>ccm</code>, <code>index</code>, <code>instance</code>, <code>start</code> and <code>instances</code> are set by _ccmjs_ during registration.
 * The component developer may set additional individual properties.
 * @property {ccm} ccm - _ccmjs_ object used by the component
 * @property {ccm.types.component_name} name - component name
 * @property {ccm.types.version_nr} [version] - component version
 * @property {ccm.types.component_index} index - component index
 * @property {Object} [config] - default configuration for created instances
 * @property {Function} [ready] - callback when this component is registered (deleted after one-time call)
 * @property {Function} instance - creates an instance out of this component
 * @property {Function} start - creates and starts an instance
 * @property {Function} Instance - construction plan for instances that can be created out of the component
 * @property {number} instances - number of created instances (is only used internally to generate instance IDs)
 * @example {
 *   ccm:       {...},
 *   name:      'chat',
 *   version:   [ 2, 1, 3 ],
 *   index:     'chat-2-1-3',
 *   config:    {...},
 *   ready:     async () => {...},
 *   instance:  config => {...},
 *   start:     config => {...},
 *   Instance:  function () {...},
 *   instances: 0
 * }
 */

/**
 * @typedef {Object} ccm.types.dataset
 * @description
 * JSON representation of a dataset that is managed via the _ccmjs_ service for data management.
 * Every dataset has a property <code>key</code> which contains the unique [dataset key]{@link ccm.types.dataset_key} of the dataset.
 * The <code>_</code> property is reserved for _permission settings_.
 * @example {
 *   "key": "demo",
 *   "text": "Hello, World!",
 *   "value": 12,
 *   "_": {
 *     "creator": "akless",
 *     "realm": "guest",
 *     "access": "creator"
 *   }
 * }
 */

/**
 * @typedef {(ccm.types.key|ccm.types.key[])} ccm.types.dataset_key
 * @description
 * Each [dataset]{@link ccm.types.dataset} that is managed via the _ccmjs_ service for data management has an unique [key]{@link ccm.types.key}.
 * Array keys are also supported. An array will be internal converted to a string with <code>.join(',')</code>.
 * @example "test"
 * @example "_foo"
 * @example "123"
 * @example "1-ABC-__123"
 * @example "_"
 * @example [ "test", "_foo", "123" ]  // => "test,_foo,123"
 * @example [ "1-ABC-__123", "_" ]  // => "1-ABC-__123,_"
 */

/**
 * @typedef {Object} ccm.types.html_data
 * @description
 * In ccmjs, loaded HTML is automatically converted into a JSON structure. This is than called HTML data.
 * ...
 */

/**
 * @typedef {Object} ccm.types.instance
 * @description
 * An object created out of a _ccmjs_ component. Below you see the typically properties.
 * The component developer may set additional individual properties.
 * @property {ccm} ccm - _ccmjs_ object used by the instance
 * @property {ccm.types.component_obj} component - component object from which the instance was created
 * @property {ccm.types.instance} [parent] - parent instance that has a dependency on this instance
 * @property {Object.<string,ccm.types.instance>} children - children instances which depend on this instance
 * @property {string} config - stringified configuration with which the component was created
 * @property {number} id - instance id: each instance is given a unique number when it is created
 * @property {string} index - unique instance index that is made up of a [component index]{@link ccm.types.component_index} and the instance id separated with a <code>-</code>
 * @property {Element} root - root element that either contains the shadow root or directly the website area to be designed
 * @property {Element} [shadow] - shadow root inside the root element that contains the webpage area designed by the instance
 * @property {Element} [inner] - contains the Light DOM that was replaced by the Shadow DOM when the instance was created
 * @property {Element} element - webpage area designed by the instance
 * @property {Function} [init] - callback when the instance is created, all dependencies are solved and before dependent instances will be initialized (deleted after one-time call)
 * @property {Function} [ready] - callback when the instance is created and initialized and all dependent instances are initialized and ready (deleted after one-time call)
 * @property {Function} start - whenever the start method is called, the instance begins to design the webpage area assigned to it
 * @property {Function} [update] - Subsequently changes the value of a configuration property and defines how the instance reacts to it. Default reaction: Restart of the instance so that the website area is redesigned.
 */

/**
 * @typedef {Object} ccm.types.instance_config
 * @description
 * ...
 */

/**
 * @typedef {string} ccm.types.key
 * @description A string that is conform with the regular expression <code>/^[a-zA-Z0-9_-]+$/</code>.
 * @example "test"
 * @example "_foo"
 * @example "123"
 * @example "1-ABC-__123"
 * @example "_"
 */

/**
 * @typedef {Object} ccm.types.resource_obj
 * @description Instead of an URL, a resource object can be passed to the method {@link ccm.load}, which then contains other information besides the URL, via which the loading of the resource is even more flexible controllable.
 * @property {string} url - URL from which the resource should be loaded
 * @property {Element} [context] - Context in which the resource should be loaded (default is <code>\<head></code>).
 * @property {string} [type] - Resource is loaded as <code>'css'</code>, <code>'html'</code>, <code>'image'</code>, <code>'js'</code>, <code>'module'</code>, <code>'json'</code> or <code>'xml'</code>. If not specified, the type is automatically recognized by the file extension. If the file extension is unknown, <code>'json'</code> is used by default.
 * @property {string} [attr] - Additional HTML attributes to be set for the HTML tag that loads the resource.
 * @property {string} [method] - HTTP method to use: <code>'PUT'</code>, <code>'GET'</code>, <code>'POST'</code>, <code>'DELETE'</code>, <code>'JSONP'</code> or <code>'fetch'</code>. Default is <code>'POST'</code>. Only relevant in case of a HTTP request.
 * @property {string} [params] - HTTP parameters to send in the case of a HTTP request. Only relevant in case of a HTTP request.
 * @property {string} [headers] - Additional HTTP headers to be set in the case of a HTTP Request. Only relevant in case of a HTTP request.
 * @property {Object} [init] - init object. Only relevant when using the [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch). This is the second parameter that will be passed to the method <code>fetch</code>.
 * @tutorial loading-of-resources
 */

/**
 * @typedef {string} ccm.types.version_index
 * @description A [version number]{@link ccm.types.version_nr} but separated with a <code>-</code> instead of a <code>.</code>.
 * @example '1-0-0'
 * @example '2-1-3'
 */

/**
 * @typedef {string} ccm.types.version_nr
 * @description A version number that is conform with Semantic Versioning 2.0.0 ({@link http://semver.org}).
 * @example '1.0.0'
 * @example '2.1.3'
 */
