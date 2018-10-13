/**
 * @overview ccm framework
 * @author André Kless <andre.kless@web.de> 2014-2018
 * @license The MIT License (MIT)
 * @version 18.0.5
 * @changes
 * version 18.0.5 (13.10.2018): bug fix for ready callback of a component object
 * version 18.0.4 (12.10.2018): bug fix for ccm.helper.unescapeHTML
 * version 18.0.3 (12.10.2018): bug fix for ccm.helper.format
 * version 18.0.2 (11.10.2018): bug fix for backward compatibility of instance dependencies
 * version 18.0.1 (11.10.2018): bug fix for ccm.helper.unescapeHTML and ccm.helper.protect
 * version 18.0.0 (30.09.2018): improved ccm.component, ccm.instance, ccm.start, ccm.store, ccm.get, ccm.set and ccm.del
 * - works with Promises and async await (no more callback, methods return a Promise) -> code refactoring
 * - no privatization for ccm datastore members
 * - renamed 'datasets' property to 'dataset' in realtime ccm datastore settings
 * - error handling via Promise catch
 * - websocket callbacks removed after one-time call
 * - bug fix at priority order when merging given instance configurations -> prepareConfig()
 * - ccm instances that uses ccm v18 or higher can reuse ccm components that using a lower ccm version (backward compatibility)
 * - each ccm component remembers its originally URL (if possible)
 * - framework version specific global component namespaces
 * - each ccm instance remembers its originally config instead of originally dependency
 * - every ccm dependency behind config property 'ignore' will not be solved
 * - ccm instance Light DOM will always be transformed to Element Nodes -> ccm.helper.html(instance.inner)
 * - HTML attributes of ccm Custom Element are always watched -> triggers instance.update()
 * - each ccm instance has a default instance.update() -> restarts instance with updated value(s)
 * - key attribute of ccm Custom Element will be deleted after processing
 * - creating of a ccm proxy instance via ccm.proxy()
 * - if ccm datastore settings given as string (not URL) then IndexedDB is used with given string as datastore name
 * - if ccm datastore settings given as URL then local cache is used and initial data is loaded via URL with ccm.load
 * - updated ccm.helper.dataset (returns Promise and uses async await and added shortcut to store dataset in its original datastore and changed order of array key elements)
 * - updated ccm.helper.integrate (no manipulation of original parameters)
 * - removed ccm.helper.isDatastoreSettings
 * - added ccm.helper.isFramework(value):boolean
 * - updated ccm.helper.isProxy
 * - added ccm.helper.isSpecialObject(value):boolean
 * - updated ccm.helper.onFinish (returns Promise and uses async await)
 * - updated ccm.helper.privatize
 * - added ccm.helper.solveDependencies(obj):Promise
 * - updated ccm.helper.solveDependency(arr):Promise
 * (for older version changes see ccm-17.0.0.js)
 */

( function () {

  /**
   * registered ccm component objects
   * @type {Object.<ccm.types.index, ccm.types.component>}
   */
  const components = {};

  /**
   * @ignore
   * for creating ccm datastores
   * @lends ccm.Datastore
   * @constructor
   */
  const Datastore = function () {

    /**
     * websocket communication callbacks
     * @type {function[]}
     */
    const callbacks = [];

    /**
     * own reference for inner functions
     * @type {ccm.Datastore}
     */
    let that;

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

        // open database
        await openDB();

        // create object store
        await createStore();

        /**
         * opens ccm database if not already open
         * @returns {Promise}
         */
        function openDB() {

          return new Promise( resolve => db ? resolve() : indexedDB.open( 'ccm' ).onsuccess = function () { db = this.result; resolve(); } );

        }

        /**
         * creates object store if not already exists
         * @returns {Promise}
         */
        function createStore() { return new Promise( resolve => {

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

        } ); }

      }

      /**
       * prepares the realtime functionality
       * @returns {Promise}
       */
      function prepareRealtime() { return new Promise( resolve => {

        // is no ccm realtime datastore? => abort
        if ( !that.url || that.url.indexOf( 'ws' ) !== 0 ) return resolve();

        // prepare initial message
        let message = [ that.db, that.name ];
        if ( that.dataset ) {
          if ( !Array.isArray( that.dataset ) ) that.dataset = [ that.dataset ];
          message = message.concat( that.dataset );
        }

        // connect to server
        that.socket = new WebSocket( that.url, 'ccm-cloud' );

        // set server notification callback
        that.socket.onmessage = message => {

          // parse server message to JSON
          const {callback,data} = JSON.parse( message.data );

          // own request? => perform callback
          if ( callback ) { callbacks[ callback ]( data ); delete callbacks[ callback ]; }

          // notification about changed data from other client? => perform change callback
          else that.onchange && that.onchange( data );

        };

        // send initial message
        that.socket.onopen = () => { that.socket.send( message ); resolve(); };

      } ); }

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
      key_or_query = self.helper.clone( key_or_query );

      // invalid key? => abort
      if ( !self.helper.isObject( key_or_query ) && !self.helper.isKey( key_or_query ) ) reject( new Error( 'invalid dataset key: ' + key_or_query ) );

      // detect managed data level
      that.url ? serverDB() : ( that.name ? clientDB() : localCache() );

      /** requests dataset(s) from local cache */
      function localCache() {

        // get local dataset(s) from local cache and solve contained data dependencies
        self.helper.solveDependencies( self.helper.clone( self.helper.isObject( key_or_query ) ? runQuery( key_or_query ) : that.local[ key_or_query ] ), undefined, true ).then( resolve ).catch( reject );

        /**
         * finds datasets in local cache by query
         * @param {Object} query
         * @returns {ccm.types.dataset[]}
         */
        function runQuery( query ) {

          const results = [];
          for ( const key in that.local ) self.helper.isSubset( query, that.local[ key ] ) && results.push( that.local[ key ] );
          return results;

        }

      }

      /** requests dataset(s) from client-side database */
      function clientDB() {

        const request = getStore().get( key_or_query );
        request.onsuccess = event => event.target.result ? ( event.target.result.key === key_or_query ? self.helper.solveDependencies( event.target.result, undefined, true ).then( resolve ).catch( resolve ) : reject( event.target.result ) ) : resolve( null );
        request.onerror   = event => reject( event.target.errorCode );

      }

      /** requests dataset(s) from server-side database */
      function serverDB() {

        ( that.socket ? useWebsocket : useHttp )( prepareParams( { get: key_or_query } ) ).then( response => self.helper.solveDependencies( response, undefined, true ) ).then( resolve ).catch( reject );

      }

    } );

    /**
     * creates or updates a dataset
     * @param {Object} priodata - priority data
     * @returns {Promise}
     */
    this.set = priodata => new Promise( ( resolve, reject ) => {

      // no manipulation of passed original parameter (avoids unwanted side effects)
      priodata = self.helper.clone( priodata );

      // priority data has no key? => generate unique key
      if ( !priodata.key ) priodata.key = self.helper.generateKey();

      // priority data contains invalid key? => abort
      if ( !self.helper.isKey( priodata.key ) ) reject( new Error( 'invalid dataset key: ' + priodata.key ) );

      // detect managed data level
      that.url ? serverDB() : ( that.name ? clientDB() : localCache() );

      /** creates/updates dataset in local cache */
      function localCache() {

        // dataset already exists? => update
        if ( that.local[ priodata.key ] ) self.helper.integrate( priodata, that.local[ priodata.key ] );

        // dataset not exists? => create
        else that.local[ priodata.key ] = priodata;

        resolve( priodata.key );
      }

      /** creates/updates dataset in client-side database */
      function clientDB() {

        const request = getStore().put( priodata );
        request.onsuccess = event => event.target.result.toString() === priodata.key.toString() ? resolve( event.target.result ) : reject( event.target.result );
        request.onerror   = event => reject( event.target.errorCode );

      }

      /** creates/updates dataset in server-side database */
      function serverDB() {

        ( that.socket ? useWebsocket : useHttp )( prepareParams( { set: priodata } ) ).then( response => ( response.toString() === priodata.key.toString() ? resolve : reject )( response ) );

      }

    } );

    /**
     * deletes a dataset
     * @param {ccm.types.key} key - dataset key
     * @returns {Promise}
     */
    this.del = key => new Promise( ( resolve, reject ) => {

      // invalid key? => abort
      if ( !self.helper.isKey( key ) ) reject( new Error( 'invalid dataset key: ' + key ) );

      // detect managed data level
      that.url ? serverDB() : ( that.name ? clientDB() : localCache() );

      /** deletes dataset in local cache */
      function localCache() {

        delete that.local[ key ]; resolve( true );

      }

      /** deletes dataset in client-side database */
      function clientDB() {

        const request = getStore().delete( key );
        request.onsuccess = event => event.target.result === undefined ? resolve( true ) : reject( event.target.result );
        request.onerror   = event => reject( event.target.errorCode );

      }

      /** deletes dataset in server-side database */
      function serverDB() {

        ( that.socket ? useWebsocket : useHttp )( prepareParams( { del: key } ) ).then( response => ( response === true ? resolve : reject )( response ) ).catch( reject );

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
    function prepareParams( params={} ) {

      if ( that.db ) params.db = that.db;
      params.store = that.name;
      const user = self.context.find( that, 'user' );
      if ( user && user.isLoggedIn() ) {
        params.realm = user.getRealm();
        params.token = user.data().token;
      }
      return params;

    }

    /**
     * sends data to server interface via websocket connection
     * @param {Object} params - data to be sent to server
     * @returns {Promise}
     */
    function useWebsocket( params ) { return new Promise( resolve => {

      const key = self.helper.generateKey();
      callbacks[ key ] = resolve;
      params.callback = key;
      that.socket.send( JSON.stringify( params ) );

    } ); }

    /**
     * sends data to server interface via HTTP request
     * @param {Object} params - data to be sent to server
     * @returns {Promise}
     */
    function useHttp( params ) {

      return self.load( { url: that.url, params: params, method: that.method } );

    }

  };

  /**
   * ccm database in IndexedDB
   * @type {Object}
   */
  let db;

  // set global ccm namespace
  if ( !window.ccm ) ccm = {

    /**
     * @summary JSONP callbacks for cross domain data exchanges via ccm.load (is always emptied directly)
     * @memberOf ccm
     * @type {Object.<string,function>}
     */
    callbacks: {},

    /**
     * @summary globally stored data of the JavaScript files downloaded via ccm.load (is always emptied directly)
     * @memberOf ccm
     * @type {Object}
     */
    files: {}

  };

  /**
   * global ccm framework object
   * @type {Object}
   */
  const self = {

    /**
     * @summary version number of ccm framework
     * @memberOf ccm
     * @returns {ccm.types.version}
     */
    version: () => '18.0.5',

    /**
     * @summary global namespaces for registered ccm components
     * @memberOf ccm
     * @type {Object.<ccm.types.index,object>}
     */
    components: {},

    /**
     * @summary loading of resources
     * @memberOf ccm
     * @see https://github.com/ccmjs/ccm/wiki/Loading-of-Resources
     * @param {...ccm.types.resource} resources - resources data
     * @returns {Promise}
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
      const call = args.slice( 0 ); call.unshift( self.load );

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
          resource = self.helper.clone( resource );

          // resource data is an array? => load resources serially
          if ( Array.isArray( resource ) ) { results[ i ] = []; serial( null ); return; }

          // has resource URL instead of resource data? => use resource data which contains only the URL information
          if ( !self.helper.isObject( resource ) ) resource = { url: resource };

          /**
           * file extension from the URL of the resource
           * @type {string}
           */
          const suffix = resource.url.split( '.' ).pop().toLowerCase();

          // ensuring lowercase on HTTP method
          if ( resource.method ) resource.method = resource.method.toLowerCase();

          // no given resource context or context is 'head'? => load resource in global <head> context (no Shadow DOM)
          if ( !resource.context || resource.context === 'head' ) resource.context = document.head;

          // given resource context is a ccm instance? => load resource in shadow root context of that instance
          if ( self.helper.isInstance( resource.context ) ) resource.context = resource.context.element.parentNode;

          /**
           * operation for loading resource
           * @type {function}
           */
          const operation = getOperation();

          // timeout check
          let timeout; self.load.timeout && self.helper.wait( self.load.timeout, () => timeout === undefined && ( timeout = true ) && error( 'timeout' ) );

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
            self.load.apply( null, next ).then( serial ).catch( serial );
            // if next resource is an array, contained resources are loaded in parallel

          }

          /**
           * determines operation for loading resource
           * @returns {function}
           */
          function getOperation() {

            switch ( resource.type ) {
              case 'html':   return importHTML;
              case 'image':  return loadImage;
              case 'css':    return loadCSS;
              case 'js':     return loadJS;
              case 'module': return loadModule;
              case 'xml':    return loadXML;
              case 'data':   return loadData;
            }

            switch ( suffix ) {
              case 'html':
                return importHTML;
              case 'jpg':
              case 'jpeg':
              case 'gif':
              case 'png':
              case 'svg':
              case 'bmp':
                return loadImage;
              case 'css':
                return loadCSS;
              case 'js':
                return loadJS;
              case 'xml':
                return loadXML;
              default:
                return loadData;
            }

          }

          /** imports a HTML file */
          function importHTML() {

            // no HTML Import support? => load polyfill
            if ( 'import' in document.createElement( 'link' ) )
              proceed();
            else
              self.load( {
                url: 'https://ccmjs.github.io/ccm/polyfills/webcomponents-hi.js',
                integrity: 'sha384-d6TZ9MlI5H/Q0IpJX6FP+ImfcDNnOBkaRrIfjCm9mo/qakdFoEvrcIX1mWk0L+Qa',
                crossorigin: 'anonymous'
              } ).then( proceed ).catch( () => error( 'failed loading HTML Import polyfill' ) );

            function proceed() {
              let element = { tag: 'link', rel: 'import', href: resource.url, async: true };
              if ( resource.attr ) self.helper.integrate( resource.attr, element );
              element = self.helper.html( element );
              element.onload = () => {
                const fragment = document.createDocumentFragment();
                const children = element.import.body.childNodes;
                for ( let i = children.length - 1; i > -1; i-- )
                  fragment.prepend( children[ i ] );
                successData( fragment );
              };
              element.onerror = event => { self.helper.removeElement( element ); error( element, event ); };
              document.head.appendChild( element );  // HTML Import does not work with Shadow DOM => use always <head>
            }

          }

          /** (pre)loads an image file */
          function loadImage() {

            // (pre)load the image file via an image object
            const image = new Image();
            image.onload = success;
            image.onerror = event => error( image, event );
            image.src = resource.url;

          }

          /** loads (and executes) a CSS file */
          function loadCSS() {

            // load the CSS file via a <link> element
            let element = { tag: 'link', rel: 'stylesheet', type: 'text/css', href: resource.url };
            if ( resource.attr ) self.helper.integrate( resource.attr, element );
            element = self.helper.html( element );
            element.onload  = success;
            element.onerror = event => { self.helper.removeElement( element ); error( element, event ); };
            resource.context.appendChild( element );

          }

          /** loads (and executes) a JavaScript file */
          function loadJS() {

            /**
             * filename of JavaScript file (without '.min')
             * @type {string}
             */
            const filename = resource.url.split( '/' ).pop().replace( '.min.', '.' );

            // mark JavaScript file as loading
            ccm.files[ filename ] = null; ccm.files[ '#' + filename ] = ccm.files[ '#' + filename ] ? ccm.files[ '#' + filename ] + 1 : 1;

            // load the JavaScript file via a <script> element
            let element = { tag: 'script', src: resource.url };
            if ( resource.attr ) self.helper.integrate( resource.attr, element );
            element = self.helper.html( element );
            element.onload = () => {

              /**
               * data globally stored by loaded JavaScript file
               * @type {*}
               */
              const data = ccm.files[ filename ];

              // remove stored data from global context
              if ( !--ccm.files[ '#' + filename ] ) { delete ccm.files[ filename ]; delete ccm.files[ '#' + filename ]; }

              // remove no more needed <script> element
              self.helper.removeElement( element );

              // perform success callback
              data !== null ? successData( data ) : success();

            };
            element.onerror = event => { self.helper.removeElement( element ); error( element, event ); };
            resource.context.appendChild( element );

          }

          /** loads a JavaScript module */
          function loadModule() {
            const callback = 'callback' + self.helper.generateKey();
            ccm.callbacks[ callback ] = function ( result ) {
              self.helper.removeElement( element );
              delete ccm.callbacks[ callback ];
              successData( result );
            };
            const element = self.helper.html( { tag: 'script', type: 'module' } );
            element.onerror = event => { self.helper.removeElement( element ); error( element, event ); };
            element.text = "import * as obj from '" + resource.url + "'; ccm.callbacks['" + callback + "']( obj )";
            document.head.appendChild( element );
          }

          /** loads a XML file */
          function loadXML() {

            if ( !resource.method ) resource.method = 'post';
            const request = new XMLHttpRequest();
            request.onreadystatechange = () => {
              if ( request.readyState === 4 )
                request.status === 200 ? successData( request.responseXML ) : error( request );
            };
            request.open( resource.method, resource.url, true );
            request.send();

          }

          /** performs a data exchange */
          function loadData() {

            // load data using desired method
            switch ( resource.method ) {
              case 'jsonp':
                jsonp();
                break;
              case 'get':
              case 'post':
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
              const callback = 'callback' + self.helper.generateKey();
              if ( !resource.params ) resource.params = {};
              resource.params.callback = 'ccm.callbacks.' + callback;
              ccm.callbacks[ callback ] = data => {
                self.helper.removeElement( element );
                delete ccm.callbacks[ callback ];
                successData( data );
              };

              // prepare <script> element for data exchange
              let element = { tag: 'script', src: buildURL( resource.url, resource.params ) };
              if ( resource.attr ) self.helper.integrate( resource.attr, element );
              element = self.helper.html( element );
              element.onerror = event => { self.helper.removeElement( element ); error( element, event ); };
              element.src = element.src.replace( /&amp;/g, '&' );  // TODO: Why is this "&amp;" happening in ccm.helper.html?

              // start data exchange
              resource.context.appendChild( element );

            }

            /** performs a data exchange via AJAX request */
            function ajax() {
              const request = new XMLHttpRequest();
              request.open( resource.method, resource.method === 'get' && resource.params ? buildURL( resource.url, resource.params ) : resource.url, true );
              request.onreadystatechange = () => {
                if ( request.readyState === 4 )
                  request.status === 200 ? successData( self.helper.regex( 'json' ).test( request.responseText ) ? JSON.parse( request.responseText ) : request.responseText ) : error( request );
              };
              request.send( resource.method === 'post' ? JSON.stringify( resource.params ) : undefined );
            }

            /** performs a data exchange via fetch API */
            function fetchAPI() {
              if ( !resource.init ) resource.init = {};
              if ( resource.params ) resource.init.method.toLowerCase() === 'post' ? resource.init.body = JSON.stringify( resource.params) : resource.url = buildURL( resource.url, resource.params );
              fetch( resource.url, resource.init ).then( response => response.text() ).then( successData ).catch( error );
            }

            /**
             * adds HTTP parameters in URL
             * @param {string} url - URL
             * @param {Object} data - HTTP parameters
             * @returns {string} URL with added HTTP parameters
             */
            function buildURL( url, data ) {
              if ( self.helper.isObject( data.json ) ) data.json = JSON.stringify( data.json );
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

          /**
           * when a data exchange has been completed successfully
           * @param {*} data - received data
           */
          function successData( data ) {

            // timeout already occurred? => abort (counter will not decrement)
            if ( checkTimeout() ) return;

            // received data is a JSON string? => parse it to JSON
            if ( typeof data === 'string' && self.helper.regex( 'json' ).test( data ) ) data = JSON.parse( data );

            // add received data to results of ccm.load call and to cache
            results[ i ] = self.helper.protect( data );

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

            return timeout ? self.helper.log( 'loading of ' + resource.url + ' succeeded after timeout (' + self.load.timeout + 'ms)' ) || true : timeout = false;

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
     * @summary registers a <i>ccm</i> component
     * @memberOf ccm
     * @param {ccm.types.index|ccm.types.url|ccm.types.component} component - <i>ccm</i> component
     * @param {ccm.types.config} [config] - default <i>ccm</i> instance configuration (check documentation of associated <i>ccm</i> component to see which properties could be set)
     * @returns {Promise}
     */
    component: async ( component, config ) => {

      // get component object
      component = await getComponentObject();

      // no component object? => throw error
      if ( !self.helper.isComponent( component ) ) return new Error( 'invalid component object' );

      // set component index
      component.index = component.name + ( component.version ? '-' + component.version.join( '-' ) : '' );

      // component not registered? => register component
      if ( !components[ component.index ] ) {

        // load needed ccm framework version
        const version = await loadFrameworkVersion();

        // component uses other framework version? => register component via other framework version (and considers backward compatibility)
        if ( version !== self.version() ) return new Promise( async resolve => {
          const result = await ccm[ version ].component( component[ component.url ? 'url' : 'index' ], config, resolve );
          result && resolve( result );
        } );

        // register component
        components[ component.index ] = component;

        // create global component namespaces
        self.components[ component.index ] = {};

        component.instances = 0;         // add ccm instance counter
        component.ccm = ccm[ version ];  // add ccm framework reference

        // initialize component
        if ( component.ready ) await component.ready(); delete component.ready;

        // define HTML tag for component
        await defineCustomElement();

        /**
         * loads needed component used ccm framework version
         * @returns {Promise}
         */
        async function loadFrameworkVersion() {

          /**
           * component used ccm framework URL
           * @type {string}
           */
          const url = typeof component.ccm === 'string' ? component.ccm : component.ccm.url;

          /**
           * version number of component used ccm framework
           * @type {string[]}
           */
          const version = ( url.match( /(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)/ ) || [ 'latest' ] )[ 0 ];

          // load needed ccm framework version if not already there
          if ( !ccm[ version ] ) await self.load( component.ccm );

          return ccm[ version ].version();
        }

        /**
         * defines Custom Element for component
         * @returns {Promise}
         */
        async function defineCustomElement() {

          // load polyfill for Custom Elements
          if ( !( 'customElements' in window ) ) await self.load( {
            url: 'https://ccmjs.github.io/ccm/polyfills/webcomponents-lite.js',
            attr: {
              integrity: 'sha384-yEuTKRGFLhOAfHNxaZiiI23KhMelYudrPUNSUK6T5u1+deGEEKsQ89cS0sPIHjyj',
              crossorigin: 'anonymous'
            }
          } );

          const name = 'ccm-' + component.index;
          if ( customElements.get( name ) ) return;
          window.customElements.define( name, class extends HTMLElement {
            connectedCallback() {
              if ( !document.body.contains( this ) ) return;
              let node = this;
              while ( node = node.parentNode )
                if ( node.tagName && node.tagName.indexOf( 'CCM-' ) === 0 )
                  return;
              self.helper.wait( 1, () => {
                const config = self.helper.generateConfig( this );
                this.removeAttribute( 'key' );
                config.root = this;
                component.start( config );
              } );
            }
          } );

        }

      }

      // is registered => use already registered component object (security reasons)
      else component = components[ component.index ];

      // no manipulation of original registered component object (security reasons)
      component = self.helper.clone( component );

      // set default instance configuration
      component.config = await prepareConfig( config, component.config );

      // add functions for creating and starting ccm instances
      component.instance = async config => await self.instance( component, await prepareConfig( config, component.config ) );
      component.start    = async config => await self.start   ( component, await prepareConfig( config, component.config ) );

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
          const index = self.helper.getIndex( component );

          // already registered component? => use already registered component object
          if ( components[ index ] ) return self.helper.clone( components[ index ] );

          // has component URL? => load component object
          if ( self.helper.regex( 'filename' ).test( component.split( '/' ).pop() ) ) { const response = await self.load( component ); response.url = component; return response; }

          // not registered and no URL? => throw error
          return new Error( 'invalid component index or URL: ' + component );

        }

        // component is directly given as object
        return component;

      }

    },

    /**
     * @summary registers a <i>ccm</i> component and creates a instance out of it
     * @memberOf ccm
     * @param {ccm.types.index|ccm.types.url|ccm.types.component} component - <i>ccm</i> component
     * @param {ccm.types.config} [config] - <i>ccm</i> instance configuration (check documentation of associated <i>ccm</i> component to see which properties could be set)
     * @returns {Promise}
     */
    instance: async ( component, config ) => {

      // get object of ccm component
      component = await self.component( component );

      // component uses other framework version? => create instance via other framework version (and considers backward compatibility)
      if ( component.ccm.version() !== self.version() ) return new Promise( async resolve => {
        const result = await ccm[ component.ccm.version() ].instance( component, config, resolve );
        result && resolve( result );
      } );

      // prepare ccm instance configuration
      config = await prepareConfig( config, component.config );

      /**
       * created and prepared ccm instance
       * @type {ccm.types.instance}
       */
      let instance = createInstance();

      // each instance knows his original config
      instance.config = JSON.stringify( config );

      // root element without DOM contact? => add root in <head> (resolving dependencies requires DOM contact)
      if ( !document.contains( instance.root ) ) {
        instance.root.position = document.createElement( 'div' );
        if ( instance.root.parentNode )
          instance.root.parentNode.replaceChild( instance.root.position, instance.root );
        document.head.appendChild( instance.root );
      }

      // solve ccm dependencies contained in config
      config = await self.helper.solveDependencies( config, instance );

      // restore original root position
      if ( document.head.contains( instance.root ) ) {
        document.head.removeChild( instance.root );
        if ( instance.root.position.parentNode )
          instance.root.position.parentNode.replaceChild( instance.root, instance.root.position );
        delete instance.root.placeholder;
      }

      // convert Light DOM to Element Node
      config.inner = self.helper.html( config.inner );

      // integrate config in created ccm instance
      Object.assign( instance, config );

      // initialize created and dependent instances
      if ( !instance.parent || !instance.parent.init ) await initialize();

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
        instance.ccm       = component.ccm;                              // framework reference
        instance.component = component;                                  // set component reference
        instance.parent    = config.parent; delete config.parent;        // reference of parent ccm instance
        instance.root      = config.root;   delete config.root;          // instance root element
        instance.id        = ++components[ component.index ].instances;  // instance ID
        instance.index     = component.index + '-' + instance.id;        // instance index (unique in hole website)
        setElement();                                                    // set root and content element
        if ( !instance.init ) instance.init = async () => {};            // each instance must have a init method

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

          // root is keyword 'name'? => use inner website area of the parent where HTML ID is equal to component name
          if ( instance.root === 'name' && instance.parent ) instance.root = instance.parent.element.querySelector( '#' + component.name );

          /**
           * root element of ccm instance
           * @type {Element}
           */
          const root = self.helper.html( { id: instance.index } );

          // set root element
          if ( instance.root ) self.helper.setContent( instance.root, root ); instance.root = root;

          /**
           * Shadow DOM of ccm instance
           * @type {ShadowRoot}
           */
          const shadow = root.shadowRoot || root.attachShadow( { mode: 'open' } );

          // set content element
          self.helper.setContent( shadow, instance.element = self.helper.html( { id: 'element' } ) );

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
                if ( self.helper.regex( 'json' ).test( value ) ) value = JSON.parse( value );
                if ( self.helper.isObject( value ) )
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
              const value = instance.root.getAttribute( key );
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
                if ( self.helper.isInstance( value ) && key !== 'parent' && !self.helper.isProxy( value) ) { instances.push( value ); relevant.push( value ); }

                // value is an object/array?
                else if ( Array.isArray( value ) || self.helper.isObject( value ) ) {

                  // not relevant object type? => skip
                  if ( self.helper.isSpecialObject( value ) ) continue;

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
            next.init().then( () => { delete next.init; init(); } );

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
            next.ready ? next.ready().then( () => { delete next.ready; ready(); } ) : ready();

          }

        } );

      }

    },

    /**
     * @summary registers a <i>ccm</i> component and creates a proxy instance out of it
     * @description Use this for lazy loading of a <i>ccm</i> instance. The proxy instance turns into the real instance on first start. Required resources are also loaded only after the first start.
     * @memberOf ccm
     * @param {ccm.types.index|ccm.types.url|ccm.types.component} component - URL of ccm component
     * @param {ccm.types.config} [config={}] - ccm instance configuration, see documentation of associated ccm component
     * @returns {Promise}
     */
    proxy: async ( component, config ) => {
      const obj = { ccm: true, component: { Instance: true } };
      obj.start = async () => {
        await Object.assign( await self.instance( component, config ), obj ).start();
      };
      return obj;
    },

    /**
     * @summary registers a <i>ccm</i> component, creates a instance out of it and starts instance
     * @memberOf ccm
     * @param {ccm.types.index|ccm.types.url|ccm.types.component} component - <i>ccm</i> component
     * @param {ccm.types.config} [config] - <i>ccm</i> instance configuration (check documentation of associated <i>ccm</i> component to see which properties could be set)
     * @returns {Promise}
     */
    start: async ( component, config ) => {
      const instance = await self.instance( component, config );
      await instance.start();
      return instance;
    },

    /**
     * @summary provides a ccm datastore
     * @param {Object} config - ccm datastore configuration
     * @returns {Promise}
     */
    store: config => new Promise( ( resolve, reject ) => {

      // no manipulation of passed original parameter (avoids unwanted side effects)
      config = self.helper.clone( config );

      // is string? => use passed parameter as datastore name or path to a JavaScript file that contains initial data for local cache
      if ( typeof config === 'string' ) config = config.endsWith( '.js' ) ? { local: [ 'ccm.load', config ] } : { name: config };

      // is no datastore configuration? => use passed parameter for initial local cache
      if ( !self.helper.isObject( config ) || ( !config.local && !config.name ) ) config = { local: config };

      // no initial local cache? => use empty object
      if ( !config.local && !config.name ) config.local = {};

      // initial local cache is given as ccm dependency? => solve dependency
      self.helper.solveDependency( config.local ).then( result => { config.local = result;

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
     * @summary requests a dataset in a <i>ccm</i> datastore
     * @param {ccm.types.settings} settings - settings for <i>ccm</i> datastore
     * @param {ccm.types.key|Object} [key_or_query={}] - dataset key or query (it's possible to use dot notation to get a specific inner value of a single dataset)
     * @returns {Promise}
     */
    get: ( settings, key_or_query ) => self.store( settings ).then( store => {

      // support dot notation to get a specific inner value of a single dataset
      let property;
      if ( typeof key_or_query === 'string' ) {
        property = key_or_query.split( '.' );
        key_or_query = property.shift();
        property = property.join( '.' );
      }

      // request dataset in datastore
      return store.get( key_or_query ).then( result => property ? self.helper.deepValue( result, property ) : result );

    } ),

    /**
     * @summary updates a dataset in a <i>ccm</i> datastore
     * @param {ccm.types.settings} settings - settings for <i>ccm</i> datastore
     * @param {Object} priodata - priority data
     * @returns {Promise}
     */
    set: ( settings, priodata ) => self.store( settings ).then( store => store.set( priodata ) ),

    /**
     * @summary deletes a dataset in a <i>ccm</i> datastore
     * @param {ccm.types.settings} settings - settings for <i>ccm</i> datastore
     * @param {string} key - dataset key
     * @returns {Promise}
     */
    del: ( settings, key ) => self.store( settings ).then( store => store.del( key ) ),

    /**
     * @ignore
     * @summary context functions for traversing in a <i>ccm</i> context tree
     * @memberOf ccm
     * @namespace
     * @ignore
     */
    context: {

      /**
       * @summary finds nearest parent that has a specific property
       * @param {ccm.types.instance} instance - starting point
       * @param {string} property - name of specific property
       * @param {boolean} not_me - exclude starting point and start with its parent
       * @returns {ccm.types.instance} nearest parent
       */
      find: ( instance, property, not_me ) => {

        const start = instance;
        if ( not_me ) instance = instance.parent;
        do
          if ( self.helper.isObject( instance ) && instance[ property ] !== undefined && instance[ property ] !== start )
            return instance[ property ];
        while ( instance = instance.parent );

      },

      /**
       * @summary get <i>ccm</i> context root
       * @param {ccm.types.instance} instance - <i>ccm</i> instance (starting point)
       * @returns {ccm.types.instance}
       */
      root: function ( instance ) {

        while ( instance.parent )
          instance = instance.parent;

        return instance;

      }

    },

    /**
     * @ignore
     * @summary helper functions for <i>ccm</i> component developers
     * @memberOf ccm
     * @namespace
     */
    helper: {

      /**
       * @summary perform action (# for own context)
       * @param {ccm.types.action} action
       * @param {Object} [context]
       * @returns {*} return value of performed action
       */
      action: function ( action, context ) {

        // is function without parameters? => perform function
        if ( typeof action === 'function' ) return action();

        if ( typeof action !== 'object' )
          action = action.split( ' ' );

        if ( typeof action[ 0 ] === 'function' )
          return action[ 0 ].apply( window, action.slice( 1 ) );
        else
        if ( action[ 0 ].indexOf( 'this.' ) === 0 )
          return this.executeByName( action[ 0 ].substr( 5 ), action.slice( 1 ), context );
        else
          return this.executeByName( action[ 0 ], action.slice( 1 ) );
      },

      append: function ( parent, node ) {

        node = self.helper.protect( node );
        parent.appendChild( node );

      },

      /**
       * @summary converts an array into an object
       * @param {Array|object} obj - array or object that contains the array
       * @param {string} [key] - object property where the array is to be found
       * @returns {Object.<string,boolean>} resulting object
       * @example console.log( arrToObj( [ 'foo', 'bar' ] ) ); => { foo: true, bar: true }
       */
      arrToObj: function arrToObj( obj, key ) {

        var arr = key ? obj[ key ] : obj;
        if ( !Array.isArray( arr ) ) return;

        var result = {};
        arr.map( function ( value ) { result[ value ] = true; } );
        if ( key ) obj[ key ] = result;
        return result;

      },

      cleanObject: function ( obj ) {

        for ( var key in obj )
          if ( !obj[ key ] )
            delete obj[ key ];
          else if ( typeof obj[ key ] === 'object' && !self.helper.isNode( obj[ key ] ) && !self.helper.isInstance( obj[ key ] ) )
            self.helper.cleanObject( obj[ key ] );

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

          if ( self.helper.isSpecialObject( value ) && !first ) return value;

          if ( Array.isArray( value ) || self.helper.isObject( value ) ) {
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
       * @summary converts dot notations in object keys to deeper properties
       * @param {Object} obj - contains object keys in dot notation
       * @returns {Object} object with converted object keys
       * @example
       * var obj = { test: 123, 'foo.bar': 'abc', 'foo.baz': 'xyz' };
       * var result = ccm.helper.convertObjectKeys( obj );
       * console.log( result );  // => { test: 123, foo: { bar: 'abc', baz: 'xyz' } }
       */
      convertObjectKeys: function ( obj ) {

        var keys = Object.keys( obj );
        keys.map( function ( key ) {
          if ( key.indexOf( '.' ) !== -1 ) {
            self.helper.deepValue( obj, key, obj[ key ] );
            delete obj[ key ];
          }
        } );
        return obj;

      },

      /**
       * delivers a dataset
       * @param {Object} [settings={}] - contains required data to determine dataset
       * @param {ccm.Datastore} [settings.store] - datastore that contains dataset
       * @param {ccm.types.key} [settings.key] - key of dataset in datastore
       * @param {boolean} [settings.login] - login user if not logged in (only if user exists)
       * @param {boolean} [settings.user] - make a user-specific key out of key (username is implicitly included)
       * @example TODO examples
       * @returns {Promise}
       */
      dataset: async ( settings={} ) => {

        // first parameter is a datastore? => move it to settings
        if ( self.helper.isDatastore( settings ) ) settings = { store: settings };

        // no manipulation of passed original parameter (avoids unwanted side effects)
        settings = self.helper.clone( settings );

        // no settings or settings are dataset directly? => settings are result
        if ( !settings || !self.helper.isDatastore( settings.store ) ) return settings;

        // key is given as second parameter? => move it to settings
        if ( !settings.key && self.helper.isKey( arguments[ 1 ] ) ) settings.key = arguments[ 1 ];

        // no dataset key? => generate a unique key
        if ( !settings.key ) settings.key = self.helper.generateKey();

        // key is initial data? => take it as result
        if ( self.helper.isDataset( settings.key ) ) return settings.key;

        /**
         * nearest user instance in ccm context tree
         * @type {ccm.types.instance}
         */
        const user = self.context.find( settings.store, 'user' );

        // user exists and must be logged in? => login user (if not already logged in)
        if ( user && settings.login ) await user.login();

        // should a user-specific key be used? => make key user-specific
        if ( self.helper.isInstance( user ) && settings.user && user.isLoggedIn() ) settings.key = [ user.data().user, settings.key ];

        // request dataset from datastore
        const dataset = await settings.store.get( settings.key );

        // dataset not exists? => result is an empty dataset
        return dataset ? dataset : { key: settings.key };

      },

      /**
       * decodes an object or array from string
       * @param {string|Object|Array} str - string (object/array: decodes all inner values)
       * @returns {Object|Array}
       */
      decodeObject: str => {

        if ( typeof str === 'string' ) {
          str = str.replace( /'/g, '"' );
          if ( self.helper.regex( 'json' ).test( str ) )
            str = JSON.parse( str );
          return str;
        }
        if ( typeof str === 'object' && !self.helper.isNode( str ) && !self.helper.isInstance( str ) )
          for ( const key in str )
            str[ key ] = self.helper.decodeObject( str[ key ] );
        return str;

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
       * encodes an object or array as string
       * @param {Object|Array} obj - object or array
       * @param {boolean} inner - do not encode object/array itself, but its values
       * @returns {string|Object|Array}
       */
      encodeObject: ( obj, inner ) => {

        if ( typeof obj !== 'object' ) return obj;
        if ( !inner ) return JSON.stringify( obj ).replace( /"/g, "'" );
        for ( const key in obj )
          if ( typeof obj[ key ] === 'object' )
            obj[ key ] = JSON.stringify( obj[ key ] ).replace( /"/g, "'" );
        return obj;

      },

      /**
       * encodes ccm dependency in a value as string
       * @param {*} value
       * @returns {*} value with encoded ccm dependencies (no copy/clone)
       */
      encodeDependencies: value => {

        // value is a ccm dependency? => encode and return it
        if ( self.helper.isDependency( value ) )
          return JSON.stringify( value ).replace( /"/g, "'" );

        // value is no plain array/object? => abort
        if ( typeof value !== 'object' || self.helper.isNode( value ) || self.helper.isInstance( value ) ) return value;

        // search deeper values for ccm dependencies
        for ( const key in value )
          value[ key ] = self.helper.encodeDependencies( value[ key ] );

        return value;
      },

      /**
       * escapes HTML characters of a string value
       * @param {string} value - string value
       * @returns {string}
       */
      escapeHTML: value => {

        const text = document.createTextNode( value );
        const div = document.createElement( 'div' );
        div.appendChild( text );
        return div.innerHTML;

      },

      /**
       * @summary perform function by function name
       * @param {string} functionName - function name
       * @param {Array} [args] - function arguments
       * @param {Object} [context] - context for this
       * @returns {*} return value of performed function
       * @ignore
       */
      executeByName: function ( functionName, args, context ) {

        if (!context) context = window;
        var namespaces = functionName.split( '.' );
        functionName = namespaces.pop();
        for ( var i = 0; i < namespaces.length; i++ )
          context = context[ namespaces[ i ]];
        return context[ functionName ].apply( context, args );
      },

      /**
       * @summary fills input elements with start values
       * @param {Element} element - HTML element which contains the input fields (must not be a HTML form tag)
       * @param {Object} data - contains the start values for the input elements
       * @example
       * var result = ccm.helper.fillForm( document.body, { username: 'JohnDoe', password: '1aA' } );
       */
      fillForm: ( element, data ) => {

        data = self.helper.clone( self.helper.protect( data ) );
        const dot = self.helper.toDotNotation( data );
        for ( const key in dot ) data[ key ] = dot[ key ];
        for ( const key in data ) {
          if ( !data[ key ] ) continue;
          if ( typeof data[ key ] === 'object' ) data[ key ] = self.helper.encodeObject( data[ key ] );
          if ( typeof data[ key ] === 'string' ) data[ key ] = self.helper.unescapeHTML( data[ key ] );
          [ ...element.querySelectorAll( '[name="' + key + '"]' ) ].map( input => {
            if ( input.type === 'checkbox' ) {
              if ( input.value && typeof data[ key ] === 'string' && data[ key ].charAt( 0 ) === '[' )
                self.helper.decodeObject( data[ key ] ).map( value => { if ( value === input.value ) input.checked = true; } );
              else
                input.checked = true;
            }
            else if ( input.type === 'radio' ) {
              if ( data[ key ] === input.value )
                input.checked = true;
            }
            else if ( input.tagName.toLowerCase() === 'select' ) {
              if ( input.hasAttribute( 'multiple' ) ) data[ key ] = self.helper.decodeObject( data[ key ] );
              [ ...input.querySelectorAll( 'option' ) ].map( option => {
                if ( input.hasAttribute( 'multiple' ) )
                  data[ key ].map( value => { value = self.helper.encodeObject( value ); if ( value === ( option.value ? option.value : option.innerHTML.trim() ) ) option.selected = true; } );
                else if ( data[ key ] === ( option.value ? option.value : option.innerHTML.trim() ) )
                  option.selected = true;
              } );
            }
            else if ( input.value === undefined )
              input.innerHTML = data[ key ];
            else
              input.value = data[ key ];
          } );
        }

      },

      filterProperties: function ( obj, properties ) {
        var result = {};
        properties = self.helper.makeIterable( arguments );
        properties.shift();
        properties.map( function ( property ) {
          if ( obj[ property ] !== undefined )
            result[ property ] = obj[ property ];
        } );
        return result;
      },

      /**
       * @summary finds a parent element with a specific HTML class
       * @param {Element} elem - starting element
       * @param {string} value - HTML class of the parent
       * @returns {Element} parent element that has the given HTML class
       * @example
       * var parent = ccm.helper.html( { class: 'foo', inner: { inner: { id: 'elem' } } } );
       * var elem = parent.querySelector( '#elem' );
       * console.log( ccm.helper.findParentElementByClass( elem, 'foo' ) ); // => parent element
       */
      findParentElementByClass: function ( elem, value ) {

        while ( elem && elem.classList && !elem.classList.contains( value ) )
          elem = elem.parentNode;
        return elem.classList.contains( value ) ? elem : null;

      },

      /**
       * @summary replaces placeholder in data with given values
       * @param {*} data - data with contained placeholders
       * @param {...*} [values] - given values
       * @returns {*} data with replaced placeholders
       */
      format: function ( data, values ) {

        const temp = [[],[],{}];
        const args = self.helper.clone( [ ...arguments ] );

        data = JSON.stringify( data, function ( key, val ) {
          if ( typeof val === 'function' ) { temp[ 0 ].push( val ); return '%$0%'; }
          return val;
        } );

        var obj_mode = data.indexOf( '{' ) === 0;

        for ( var i = 1; i < args.length; i++ ) {
          if ( typeof args[ i ] === 'object' )
            for ( var key in args[ i ] ) {
              if ( typeof args[ i ][ key ] === 'string' )
                args[ i ][ key ] = escape( args[ i ][ key ] );
              else if ( obj_mode ) {
                temp[ 2 ][ key ] = args[ i ][ key ];
                args[ i ][ key ] = '%$2%'+key+'%';
              }
              data = data.replace( new RegExp( '%'+key+'%', 'g' ), args[ i ][ key ] );
            }
          else {
            if ( typeof args[ i ] === 'string' )
              args[ i ] = escape( args[ i ] );
            else if ( obj_mode ) {
              temp[ 1 ].push( args[ i ] );
              args[ i ] = '%$1%';
            }
            data = data.replace( /%%/, args[ i ] );
          }
        }

        return JSON.parse( data, function ( key, val ) {
          if ( val === '%$0%' ) return temp[ 0 ].shift();
          if ( val === '%$1%' ) return temp[ 1 ].shift();
          if ( typeof val === 'string' && val.indexOf( '%$2%' ) === 0 ) return temp[ 2 ][ val.split( '%' )[ 2 ] ];
          return val;
        } );

        function escape( string ) {
          return string.replace( /"/g, "'" ).replace( /\\/g, '\\\\' ).replace( /\n/g, '\\n' ).replace( /\r/g, '\\r' ).replace( /\t/g, '\\t' ).replace( /\f/g, '\\f' );
        }

      },

      /**
       * @summary gets the input data of a form
       * @param {Element} element - HTML element which contains the input fields (must not be a HTML form tag)
       * @returns {Object} input data
       * @example
       * var result = ccm.helper.formData( document.body );
       * console.log( result );  // { username: 'JohnDoe', password: '1aA' }
       */
      formData: element => {

        const data = {};
        [ ...element.querySelectorAll( '[name]' ) ].map( input => {
          if ( input.type === 'checkbox' ) {
            const value = input.checked ? ( input.value === 'on' ? true : input.value ) : ( input.value === 'on' ? false : '' );
            const multi = [ ...element.querySelectorAll( '[name="' + input.name + '"]' ) ].length > 1;
            if ( multi ) {
              if ( !data[ input.name ] ) data[ input.name ] = [];
              data[ input.name ].push( value );
            }
            else data[ input.name ] = value;
          }
          else if ( input.type === 'radio' )
            data[ input.name ] = input.checked ? input.value : ( data[ input.name ] ? data[ input.name ] : '' );
          else if ( input.tagName.toLowerCase() === 'select' ) {
            let result = [];
            if ( input.hasAttribute( 'multiple' ) )
              [ ...input.querySelectorAll( 'option' ) ].map( option => option.selected && result.push( option.value ? option.value : option.inner ) );
            else
              [ ...input.querySelectorAll( 'option' ) ].map( option => {
                if ( option.selected ) result = option.value ? option.value : option.inner;
              } );
            data[ input.name ] = result;
          }
          else if ( input.type === 'number' || input.type === 'range' ) {
            let value = parseInt( input.value );
            if ( isNaN( value ) ) value = '';
            data[ input.name ] = value;
          }
          else if ( input.value !== undefined )
            data[ input.name ] = input.value;
          else
            data[ input.getAttribute( 'name' ) ] = input.innerHTML;
          try {
            if ( typeof data[ input.name ] === 'string' && self.helper.regex( 'json' ).test( data[ input.name ] ) )
              data[ input.name ] = self.helper.decodeObject( data[ input.name ] );
          } catch ( err ) {}
          if ( typeof data[ input.name ] === 'string' )
            data[ input.name ] = self.helper.escapeHTML( data[ input.name ] );
        } );
        return self.helper.protect( self.helper.solveDotNotation( data ) );

      },

      /**
       * @summary generate instance configuration out of a HTML tag
       * @param {Object} node - HTML tag
       * @returns {ccm.types.config}
       */
      generateConfig: function ( node ) {

        var config = {};
        catchAttributes( node, config );
        catchInnerTags( node );
        return config;

        function catchAttributes( node, obj ) {

          self.helper.makeIterable( node.attributes ).map( function ( attr ) {
            if ( attr.name !== 'src' ||
              ( node.tagName.indexOf( 'CCM-COMPONENT' ) !== 0
                && node.tagName.indexOf( 'CCM-INSTANCE'  ) !== 0
                && node.tagName.indexOf( 'CCM-PROXY'     ) !== 0 ) )
              try {
                obj[ attr.name ] = attr.value.charAt( 0 ) === '{' || attr.value.charAt( 0 ) === '[' ? JSON.parse( attr.value ) : prepareValue( attr.value );
              } catch ( err ) {}
          } );

        }

        function catchInnerTags( node ) {

          config.childNodes = [];
          self.helper.makeIterable( node.childNodes ).map( function ( child ) {
            if ( child.tagName && child.tagName.indexOf( 'CCM-' ) === 0 ) {
              var split = child.tagName.toLowerCase().split( '-' );
              if ( split.length < 3 ) split[ 2 ] = split[ 1 ];
              switch ( split[ 1 ] ) {
                case 'load':
                  self.helper.deepValue( config, split[ 2 ], interpretLoadTag( child, split[ 2 ] ) );
                  break;
                case 'component':
                case 'instance':
                case 'proxy':
                  self.helper.deepValue( config, split[ 2 ], [ 'ccm.' + split[ 1 ], child.getAttribute( 'src' ) || split[ 2 ], self.helper.generateConfig( child ) ] );
                  break;
                case 'store':
                case 'get':
                  var settings = {};
                  catchAttributes( child, settings );
                  var key = settings.key;
                  delete settings.key;
                  self.helper.deepValue( config, split[ 2 ], [ 'ccm.' + split[ 1 ], settings, key ] );
                  break;
                case 'list':
                  var list = null;
                  self.helper.makeIterable( child.children ).map( function ( entry ) {
                    if ( entry.tagName && entry.tagName.indexOf( 'CCM-ENTRY' ) === 0 ) {
                      var value = prepareValue( entry.getAttribute( 'value' ) );
                      var split = entry.tagName.toLowerCase().split( '-' );
                      if ( !list )
                        list = split.length < 3 ? [] : {};
                      if ( split.length < 3 )
                        list.push( value );
                      else
                        self.helper.deepValue( list, split[ 2 ], value );
                    }
                  } );
                  if ( !list ) list = {};
                  catchAttributes( child, list );
                  if ( list ) self.helper.deepValue( config, split[ 2 ], list );
                  break;
                default:
                  config.childNodes.push( child );
                  node.removeChild( child );
              }
            }
            else {
              config.childNodes.push( child );
              node.removeChild( child );
            }
          } );
          if ( config.inner ) return;
          config.inner = self.helper.html( {} );
          config.childNodes.map( function ( child ) {
            config.inner.appendChild( child );
          } );
          delete config.childNodes;
          if ( !config.inner.hasChildNodes() ) delete config.inner;

          function interpretLoadTag( node ) {

            var params = generateParameters( node );
            if ( !Array.isArray( params ) ) params = [ params ];
            params.unshift( 'ccm.load' );
            if ( node.hasAttribute( 'head' ) ) params.push( true );
            return params;

            function generateParameters( node ) {

              if ( node.hasAttribute( 'src' ) ) {
                if ( node.children.length === 0 )
                  return node.getAttribute( 'src' );
                var data = {};
                self.helper.makeIterable( node.children ).map( function ( child ) {
                  if ( child.tagName && child.tagName.indexOf( 'CCM-DATA-' ) === 0 )
                    data[ child.tagName.toLowerCase().split( '-' )[ 2 ] ] = child.getAttribute( 'value' );
                } );
                return [ node.getAttribute( 'src' ), data ];
              }
              var params = [];
              self.helper.makeIterable( node.children ).map( function ( child ) {
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
          if ( value === ''          ) return '';
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

        return Date.now() + 'X' + Math.random().toString().substr( 2 );

      },

      /**
       * @summary get HTML DOM ID of the website area for the content of an <i>ccm</i> instance
       * @param {ccm.types.instance} instance - <i>ccm</i> instance
       * @returns {string}
       */
      getElementID: function ( instance ) {

        return 'ccm-' + instance.index;

      },

      /**
       * @summary get ccm component index by URL
       * @param {string} url - ccm component URL
       * @returns {ccm.types.index} ccm component index
       */
      getIndex: function ( url ) {

        // url is already an ccm component index? => abort and return it
        if ( url.indexOf( '.js' ) === -1 ) return url;

        /**
         * from given url extracted filename of the ccm component
         * @type {string}
         */
        var filename = url.split( '/' ).pop();

        // abort if extracted filename is not a valid filename for a ccm component
        if ( !self.helper.regex( 'filename' ).test( filename ) ) return '';

        // filter and return the component index out of the extracted filename
        var split = filename.split( '.' );
        if ( split[ 0 ] === 'ccm' )
          split.shift();
        split.pop();
        if ( split[ split.length - 1 ] === 'min' )
          split.pop();
        return split.join( '-' );

      },

      hide: function ( instance ) {
        instance.element.parentNode.appendChild( self.helper.loading( instance ) );
        instance.element.style.display = 'none';
      },

      /**
       * @summary generate HTML with JSON (recursive)
       * @param {string|ccm.types.html|ccm.types.html[]|Element|jQuery} html - <i>ccm</i> HTML data
       * @param {...string} [values] - values to replace placeholder
       * @returns {Element|Element[]} generated HTML
       */
      html: function( html, values ) {

        // HTML string? => convert to HTML elements
        if ( typeof html === 'string' ) html = document.createRange().createContextualFragment( html );

        // jQuery element? => convert to HTML elements
        if ( window.jQuery && html instanceof jQuery ) {
          html = html.get();
          const fragment = document.createDocumentFragment();
          html.map( elem => fragment.appendChild( elem ) );
          html = fragment;
        }

        // HTML element instead of HTML data? => abort (result is given HTML element)
        if ( self.helper.isNode( html ) ) return html;

        // clone HTML data
        html = self.helper.clone( html );

        // replace placeholder
        if ( arguments.length > 1 ) html = self.helper.format.apply( this, arguments );

        // get more than one HTML tag?
        if ( Array.isArray( html ) ) {

          // generate each HTML tag
          var result = [];
          for ( var i = 0; i < html.length; i++ )
            result.push( self.helper.html( html[ i ] ) );  // recursive call
          return result;

        }

        // get no ccm html data? => return parameter value
        if ( typeof html !== 'object' ) return html;

        /**
         * HTML tag
         * @type {ccm.types.element}
         */
        var element = document.createElement( self.helper.htmlEncode( html.tag || 'div' ) );

        // remove 'tag' and 'key' property
        delete html.tag; delete html.key;

        // iterate over ccm html data properties
        for ( var key in html ) {

          /**
           * value of ccm html data property
           * @type {string|ccm.types.html|Array}
           */
          var value = html[ key ];

          // interpret ccm html data property
          switch ( key ) {

            // HTML boolean attributes
            case 'async':
            case 'autofocus':
            case 'checked':
            case 'defer':
            case 'disabled':
            case 'ismap':
            case 'multiple':
            case 'required':
            case 'selected':
              if ( value ) element[ key ] = true;
              break;
            case 'readonly':
              if ( value ) element.readOnly = true;
              break;

            // inner HTML
            case 'inner':
              if ( typeof value === 'string' || typeof value === 'number' ) { element.innerHTML = value; break; }
              var children = this.html( value );  // recursive call
              if ( !Array.isArray( children ) )
                children = [ children ];
              for ( var i = 0; i < children.length; i++ )
                if ( self.helper.isNode( children[ i ] ) )
                  element.appendChild( children[ i ] );
                else
                  element.innerHTML += children[ i ];
              break;

            // HTML value attributes and events
            default:
              if ( key.indexOf( 'on' ) === 0 && typeof value === 'function' )  // is HTML event
                element.addEventListener( key.substr( 2 ), value );
              else                                                             // is HTML value attribute
                element.setAttribute( key, self.helper.htmlEncode( value ) );
          }

        }

        // return generated HTML
        return self.helper.protect( element );

      },

      /**
       * @summary HTML-encode a string
       * @see http://stackoverflow.com/questions/1219860/html-encoding-in-javascript-jquery
       * @param {string} value - string
       * @param {boolean} [trim=true] - .trim()
       * @param {boolean} [quot=true] - .replace( /"/g, '&quot;' )
       * @returns {string} HTML-encoded string
       */
      htmlEncode: function ( value, trim, quot ) {

        if ( typeof value !== 'string' ) value = value.toString();
        value = trim || trim === undefined ? value.trim() : value;
        var tag = document.createElement( 'span' );
        tag.innerHTML = value;
        value = tag.textContent;
        value = quot || quot === undefined ? value.replace( /"/g, '&quot;' ) : value;
        return value;

      },

      /**
       * @summary integrate priority data into a given dataset
       * @description
       * Each value of each property in the given priority data will be set in the given dataset for the property of the same name.
       * This method also supports dot notation in given priority data to set a single deeper property in the given dataset.
       * With no given priority data, the result is the given dataset.
       * With no given dataset, the result is the given priority data.
       * @param {Object} [priodata] - priority data
       * @param {Object} [dataset] - dataset
       * @param {boolean} [as_defaults] - integrate values only if not already exist
       * @returns {Object} dataset with integrated priority data
       * @example
       * var dataset  = { firstname: 'John', lastname: 'Doe', fullname: 'John Doe' };
       * var priodata = { lastname: 'Done', fullname: undefined };
       * var result = ccm.helper.integrate( priodata, dataset );
       * console.log( result );  // { firstname: 'John', lastname: 'Done', fullname: undefined };
       * @example
       * var result = ccm.helper.integrate( { foo: { a: 'x': b: 'y' } }, { 'foo.c': 'z' } );
       * console.log( result );  // { foo: { a: 'x', b: 'y', c: 'z' } }
       * @example
       * var result = ccm.helper.integrate( { value: 'foo' } );
       * console.log( result );  // { value: 'foo' }
       * @example
       * var result = ccm.helper.integrate( undefined, { value: 'foo' } );
       * console.log( result );  // { value: 'foo' }
       */
      integrate: function ( priodata, dataset, as_defaults ) {

        dataset = self.helper.clone( dataset );

        // no given priority data? => return given dataset
        if ( !self.helper.isObject( priodata ) ) return dataset;

        // no given dataset? => return given priority data
        if ( !self.helper.isObject( dataset ) ) return self.helper.clone( priodata );

        // iterate over priority data properties
        for ( const key in priodata ) {

          // set value for the same property in the given dataset
          if ( !as_defaults || self.helper.deepValue( dataset, key ) === undefined ) self.helper.deepValue( dataset, key, priodata[ key ] );

        }

        // return dataset with integrated priority data
        return dataset;

      },

      /**
       * @summary check value for <i>ccm</i> component
       * @param {*} value - value to check
       * @returns {boolean}
       */
      isComponent: function ( value ) {

        return self.helper.isObject( value ) && value.Instance && true;

      },

      /**
       * checks if a value is a ccm dataset
       * @param {*} value - value to check
       * @returns {boolean}
       */
      isDataset: value => self.helper.isObject( value ) && self.helper.isKey( value.key ),

      /**
       * checks if a value is a ccm datastore object
       * @param {*} value - value to check
       * @returns {boolean}
       */
      isDatastore: value => self.helper.isObject( value ) && value.get && value.set && value.del && true,

      /**
       * check value if it is a <i>ccm</i> dependency
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
      isElementNode: function ( value ) {

        return value instanceof Element || value instanceof DocumentFragment;
        //return self.helper.isNode( value ) && value.tagName && true;

      },

      isFirefox: function () {

        return navigator.userAgent.search( 'Firefox' ) > -1;

      },

      /**
       * @summary checks if a value is a <i>ccm</i> framework object
       * @param {*} value - value to check
       * @returns {boolean}
       */
      isFramework: value => self.helper.isObject( value ) && value.callbacks && value.components && value.files && true,

      isGoogleChrome: function () {

        return /Chrome/.test( navigator.userAgent ) && /Google Inc/.test( navigator.vendor );

      },

      /**
       * @summary checks if a value is a <i>ccm</i> instance
       * @param {*} value - value to check
       * @returns {boolean}
       */
      isInstance: value => self.helper.isObject( value ) && self.helper.isComponent( value.component ) && value.ccm && true,

      /**
       * checks if a value is a valid ccm dataset key
       * @param {*} value - value to check
       * @returns {boolean}
       */
      isKey: value => {

        // value is a string? => check if it is an valid key
        if ( typeof value === 'string' ) return self.helper.regex( 'key' ).test( value );

        // value is an array? => check if it is an valid array key
        if ( Array.isArray( value ) ) {
          for ( let i = 0; i < value.length; i++ )
            if ( !self.helper.regex( 'key' ).test( value[ i ] ) )
              return false;
          return true;
        }

        // value is not a dataset key? => not valid
        return false;

      },

      /**
       * checks if a value is a loading error of ccm.load
       * @param {*} value - value to check
       */
      isLoadError: value => {

        return self.helper.isObject( value )
          && value.error instanceof Error
          && self.helper.isObject( value.resource )
          && Array.isArray( value.call )
          && value.call.length >= 1
          && value.call[ 0 ].name === 'load';

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

        return self.helper.isInstance( value ) && value.component === true;

      },

      /**
       * checks if a value is an resource data object
       * @param {*} value - value to check
       * @returns {boolean}
       */
      isResourceDataObject: value => self.helper.isObject( value ) && value.url && ( value.context || value.method || value.params || value.attr || value.ignore_cache || value.type ) && true,

      isSafari: function () {

        return /^((?!chrome|android).)*safari/i.test( navigator.userAgent );

      },

      /**
       * @summary checks if a value is a special object: (Window Object, Node, ccm Framework Object, ccm Instance, ccm Component Object, ccm Datastore, jQuery Object)
       * @param {*} value
       * @returns {boolean}
       */
      isSpecialObject: value => {

        return !!( value === window || self.helper.isNode( value ) || self.helper.isFramework( value ) || self.helper.isInstance( value ) || self.helper.isComponent( value ) || self.helper.isDatastore( value ) || window.jQuery && value instanceof jQuery );

      },

      /**
       * @summary checks if an object is a subset of another object
       * @param {Object} obj - object
       * @param {Object} other - another object
       * @returns {boolean}
       * @example
       * var obj = {
       *   name: 'John Doe',
       *   counter: 3,
       *   isValid: true
       * };
       * var other = {
       *   name: 'John Doe',
       *   counter: 3,
       *   isValid: true,
       *   values: [ 'abc', 123, false ],
       *   settings: { title: 'Welcome!', year: 2017, greedy: true },
       *   onLoad: function () { console.log( 'Loading..' ); }
       * };
       * var result = ccm.helper.isSubset( obj, other );
       * console.log( result );  // => true
       */
      isSubset: function ( obj, other ) {

        for ( var i in obj )
          if ( typeof obj[ i ] === 'object' && typeof other[ i ] === 'object' ) {
            if ( JSON.stringify( obj[ i ] ) !== JSON.stringify( other[ i ] ) )
              return false;
          }
          else if ( obj[ i ] !== other[ i ] )
            return false;
        return true;

      },

      /**
       * @summary returns a <i>ccm</i> loading icon as HTML node element
       * @param {ccm.instance} instance - <i>ccm instance</i> (for determining Shadow DOM)
       * @types {ccm.types.node}
       * @example document.body.appendChild( ccm.helper.loading() );
       */
      loading: function ( instance ) {

        // set keyframe for ccm loading icon animation
        const element = instance ? instance.element.parentNode : document.head;
        if ( !element.querySelector( '#ccm_keyframe' ) ) {
          const style = document.createElement( 'style' );
          style.id = 'ccm_keyframe';
          style.appendChild( document.createTextNode( '@keyframes ccm_loading { to { transform: rotate(360deg); } }' ) );
          element.appendChild( style );
        }

        return self.helper.html( { class: 'ccm_loading', style: 'display: grid;', inner: { style: 'align-self: center; justify-self: center; display: inline-block; width: 2em; height: 2em; border: 0.3em solid #f3f3f3; border-top-color: #009ee0; border-left-color: #009ee0; border-radius: 50%; animation: ccm_loading 1.5s linear infinite;' } } );
      },

      /**
       * logs a ccm-specific message in the browser console
       * @param {*} message
       */
      log: message => console.log( '[ccm]', message ),

      /**
       * @summary make something that's nearly array-like iterable (see examples)
       * @param array_like
       * @returns {Array}
       * @example
       * // makes arguments of a function iterable
       * ccm.helper.makeIterable( arguments ).map( function ( arg ) { ... } );
       * @example
       * // makes the children of a HTML element node iterable
       * ccm.helper.makeIterable( document.getElementById( "dummy" ).children ).map( function ( child ) { ... } );
       * @example
       * // makes the attributes of a HTML element node iterable
       * ccm.helper.makeIterable( document.getElementById( "dummy" ).attributes ).map( function ( attr ) { ... } );
       */
      makeIterable: function ( array_like ) {
        return Array.prototype.slice.call( array_like );
      },

      /**
       * @summary performs minor finish actions
       * @param {ccm.types.instance} instance - finished <i>ccm</i> instance
       * @param {function|object|string} instance.onfinish - finish callback or settings for minor finish actions or global function name that should be called as finish callback
       * @param {string} [instance.onfinish.confirm] - show confirm box (no finish actions will performed if user chooses abort)
       * @param {boolean} [instance.onfinish.login] - user will be logged in if not already logged in (only works if the instance has a public property "user" with a <i>ccm</i> user instance as the value)
       * @param {boolean} [instance.onfinish.log] - log result data in browser console
       * @param {Object} [instance.onfinish.clear] - clear website area of the finished <i>ccm</i> instance
       * @param {Object|boolean} [instance.onfinish.store] - use this to store the result data in a data store
       * @param {ccm.types.settings} instance.onfinish.store.settings - settings for a <i>ccm</i> datastore (result data will be set in this datastore)
       * @param {ccm.types.key} [instance.onfinish.store.key] - dataset key for result data (default is generated key)
       * @param {boolean} [instance.onfinish.store.user] - if set, the key is extended by the user ID of the logged-in user (only works if the instance has a public property "user" with a <i>ccm</i> user instance as the value and the user is logged in)
       * @param {Object} [instance.onfinish.permissions] - permission settings for set operation
       * @param {boolean} [instance.onfinish.restart] - restart finished <i>ccm</i> instance
       * @param {Object} [instance.onfinish.render] - render other content (could be <i>ccm</i> HTML data or data for embedding another <i>ccm</i> component)
       * @param {string|object} [instance.onfinish.render.component] - URL, index, or object of the <i>ccm</i> component that should be embed
       * @param {Object} [instance.onfinish.render.config] - instance configuration for embed
       * @param {string} [instance.onfinish.alert] - show alert message
       * @param {callback} [instance.onfinish.callback] - additional individual finish callback (will be called after the performed minor actions)
       * @param {Object} results - result data
       * @returns {Promise}
       * @example
       * instance.onfinish = {
       *   confirm: 'Are you sure?',
       *   login: true,
       *   log: true,
       *   clear: true,
       *   store: {
       *     settings: { store: 'example', url: 'path/to/server/interface.php' },
       *     key: 'example',
       *     user: true,
       *     unique: true,
       *     permissions: {
       *       creator: 'akless2m',
       *       group: {
       *         mkaul2m: true,
       *         akless2s: true
       *       },
       *       access: {
       *         get: 'all',
       *         set: 'group',
       *         del: 'creator'
       *       }
       *     }
       *   },
       *   restart: true,
       *   render: {
       *     component: 'component_url',
       *     config: {...}
       *   },
       *   alert: 'Finished!',
       *   callback: function ( instance, results ) { console.log( results ); }
       * };
       */
      onFinish: async ( instance, results ) => {

        /**
         * settings for onfinish actions
         * @type {function|string|Object}
         */
        const settings = instance.onfinish;

        // no finish callback? => abort
        if ( !settings ) return;

        // no result data and the instance has a method 'getValue'? => get result data from that method
        if ( results === undefined && instance.getValue ) results = instance.getValue();

        // has only function? => abort and call it as finish callback
        if ( typeof settings === 'function' ) return settings( instance, results );

        // has only string as global function name? => abort and call it as finish callback
        if ( typeof settings === 'string' ) return this.executeByName( settings, [ instance, results ] );

        // confirm box
        if ( settings.confirm && confirm( !settings.confirm ) ) return;

        /**
         * nearest user instance in ccm context
         * @type {ccm.types.instance}
         */
        const user = self.context.find( instance, 'user' );

        // has user instance? => login user (if not already logged in)
        settings.login && user && await user.login();

        // log result data (if necessary)
        settings.log && console.log( results );

        // clear website area of the instance (if necessary)
        if ( settings.clear ) instance.element.innerHTML = '';

        // has to store result data in a datastore?
        if ( settings.store ) {

          /**
           * deep copy of result data
           * @type {Object}
           */
          const dataset = self.helper.clone( results );

          // allow shortcut for update dataset in its original datastore
          if ( settings.store === true ) settings.store = {};

          // prepare dataset key
          if ( settings.store.key ) dataset.key = settings.store.key;
          if ( !Array.isArray( dataset.key ) ) dataset.key = [ dataset.key || self.helper.generateKey() ];
          settings.store.user && user && user.isLoggedIn() && dataset.key.push( user.data().user );
          settings.store.unique && dataset.key.push( self.helper.generateKey() );

          // prepare permission settings
          if ( settings.store.permissions ) dataset._ = settings.store.permissions;

          // has store settings?
          if ( settings.store.settings ) {

            // set user instance for datastore
            if ( user ) settings.store.settings.user = user;

            // store result data in datastore
            await self.set( settings.store.settings, dataset );
          }
          // update dataset in its original datastore
          else await instance.data.store.set( dataset );

        }

        // alert message
        if ( settings.alert ) alert( settings.alert );

        // restart instance (if necessary)
        settings.restart && await instance.start();

        // render other content (if necessary)
        if ( settings.render )
          if ( self.helper.isObject( settings.render ) && settings.render.component ) {
            let config = settings.render.config;
            if ( !config ) config = {};
            const result = await self.start( settings.render.component, config );
            self.helper.replace( result.root, instance.root );
          }
          else self.helper.replace( self.helper.html( settings.render ), instance.root );

        // perform finish callback (if necessary)
        settings.callback && settings.callback( instance, results );

      },

      prepend: function ( parent, node ) {

        node = self.helper.protect( node );
        if ( parent.hasChildNodes() )
          parent.insertBefore( node, parent.firstChild );
        else
          parent.appendChild( node );

      },

      /**
       * @summary privatizes public members of an <i>ccm</i> instance
       * @description
       * Deletes all given properties in a given <i>ccm</i> instance and returns an object with the deleted properties and there values.
       * If no properties are given, then all not <i>ccm</i> relevant instance properties will be privatized.
       * List of <i>ccm</i> relevant properties that could not be privatized:
       * <ul>
       *   <li><code>childNodes</code></li>
       *   <li><code>component</code></li>
       *   <li><code>element</code></li>
       *   <li><code>id</code></li>
       *   <li><code>index</code></li>
       *   <li><code>onfinish</code></li>
       *   <li><code>node</code></li>
       *   <li><code>parent</code></li>
       * </ul>
       * In addition to this properties all functions and depending <i>ccm</i> context relevant <i>ccm</i> instances will also not be privatized.
       * @param {ccm.types.instance} instance - <i>ccm</i> instance
       * @param {...string|boolean} [properties] - properties that have to privatized, default: privatizes all not <i>ccm</i> relevant properties (if true: privatize all but don't remove privatized properties in instance)
       * @returns {Object} object that contains the privatized properties and there values
       * @example
       * // privatize two public instance members
       * ccm.component( {
       *   name: 'dummy1',
       *   config: { foo: 'abc', bar: 'xyz', baz: 4711 },
       *   Instance: function () {
       *     var self = this;
       *     var my;
       *     this.ready = function ( callback ) {
       *       my = ccm.helper.privatize( self, 'foo', 'bar' );
       *       console.log( my );                // => { foo: 'abc', bar: 'xyz' }
       *       console.log( my.foo, self.foo );  // => 'abc' undefined
       *       console.log( my.bar, self.bar );  // => 'xyz' undefined
       *       console.log( my.baz, self.baz );  // => undefined 4711
       *       callback();
       *     };
       *   }
       * } );
       * @example
       * // privatize all possible public instance members
       * ccm.component( {
       *   name: 'dummy2',
       *   config: { foo: 'abc', bar: 'xyz', baz: 4711 },
       *   Instance: function () {
       *     var self = this;
       *     var my;
       *     this.ready = function ( callback ) {
       *       my = ccm.helper.privatize();
       *       console.log( my );                // => { foo: 'abc', bar: 'xyz', baz: 4711 }
       *       console.log( my.foo, self.foo );  // => 'abc' undefined
       *       console.log( my.bar, self.bar );  // => 'xyz' undefined
       *       console.log( my.baz, self.baz );  // => 4711 undefined
       *       callback();
       *     };
       *   }
       * } );
       */
      privatize: function ( instance, properties ) {

        const keep = properties === true;
        const obj = {};
        if ( properties && !keep )
          for ( let i = 1; i < arguments.length; i++ )
            privatizeProperty( arguments[ i ] );
        else
          for ( const key in instance )
            privatizeProperty( key )
        return obj;

        function privatizeProperty( key ) {
          if ( key === true ) return;
          switch ( key ) {
            case 'ccm':
            case 'component':
            case 'config':
            case 'dependency':
            case 'element':
            case 'id':
            case 'index':
            case 'onfinish':
            case 'parent':
            case 'root':
              break;
            default:
              if ( self.helper.isInstance( instance[ key ] ) && instance[ key ].parent && instance[ key ].parent.index === instance.index ) return;
              if ( typeof instance[ key ] === 'function' ) return;
              if ( instance[ key ] !== undefined ) obj[ key ] = instance[ key ];
              if ( !keep ) delete instance[ key ];
          }
        }

      },

      /**
       * filters script elements out of given value
       * @param {*} value
       * @returns {*}
       */
      protect: value => {

        if ( typeof value === 'string' ) {
          const tag = document.createElement( 'div' );
          tag.innerHTML = value;
          [ ...tag.querySelectorAll( 'script' ) ].forEach( self.helper.removeElement );
          return self.helper.unescapeHTML( tag.innerHTML );
        }

        if ( self.helper.isElementNode( value ) )
          [ ...value.querySelectorAll( 'script' ) ].forEach( self.helper.removeElement );

        else if ( typeof value === 'object' && !self.helper.isSpecialObject( value ) )
          for ( const key in value )
            value[ key ] = self.helper.protect( value[ key ] );

        return value;

      },

      /**
       * @summary get a <i>ccm</i> relevant regular expression
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
       *     <td>filename for an <i>ccm</i> instance</td>
       *     <td>/^(ccm.)?([^.-]+)(-(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*))?(\.min)?(\.js)$/</td>
       *   </tr>
       *   <tr>
       *     <td><code>'key'</code></td>
       *     <td>key for a <i>ccm</i> dataset</td>
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
          case 'filename': return /^ccm\.([a-z][a-z0-9_]*)(-(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*))?(\.min)?(\.js)$/;
          case 'key':      return /^[a-zA-Z0-9_\-]+$/;
          case 'json':     return /^(({.*})|(\[.*])|true|false|null)$/;
        }

      },

      removeElement: function ( element ) {
        if ( element.parentNode ) element.parentNode.removeChild( element );
      },

      /**
       * renames the property name of an object
       * @param obj - the object that contains the property name
       * @param before - old property name
       * @param after - new property name
       * @example
       * const obj = { foo: 5711 };
       * ccm.helper.renameProperty( obj, 'foo', 'bar' );
       * console.log( obj );  // => { "bar": 5711 }
       */
      renameProperty: ( obj, before, after ) => {
        if ( obj[ before ] === undefined ) return delete obj[ before ];
        obj[ after ] = obj[ before ];
        delete obj[ before ];
      },

      replace: ( newnode, oldnode ) => {

        oldnode.parentNode && oldnode.parentNode.replaceChild( self.helper.protect( newnode ), oldnode );

      },

      /**
       * @summary set the content of an HTML element
       * @param {ccm.types.element} element - HTML element
       * @param {string|ccm.types.element|ccm.types.element[]} content - HTML element or HTML string for content
       */
      setContent: function ( element, content ) {

        content = self.helper.protect( content );
        if ( typeof content === 'object' ) {
          element.innerHTML = '';
          if ( Array.isArray( content ) )
            content.map( function ( node ) { element.appendChild( node ); } );
          else
            element.appendChild( content );
        }
        else element.innerHTML = content;

      },

      show: function ( instance ) {
        instance.element.parentNode.removeChild( instance.element.parentNode.querySelector( '.ccm_loading' ) );
        instance.element.style.display = 'block';
      },

      /**
       * @summary shuffles an array (Durstenfeld shuffle)
       * @see http://en.wikipedia.org/wiki/Fisher-Yates_shuffle#The_modern_algorithm
       * @param {Array} array
       * @returns {Array}
       */
      shuffleArray: function ( array ) {
        for ( var i = array.length - 1; i > 0; i-- ) {
          var j = Math.floor( Math.random() * ( i + 1 ) );
          var temp = array[ i ];
          array[ i ] = array[ j ];
          array[ j ] = temp;
        }
        return array;
      },

      /**
       * @summary solves ccm dependencies contained in an object or array
       * @param {Object|Array} obj - object or array
       * @param {ccm.types.instance} [instance] - associated ccm instance
       * @param {boolean} [data_only] - only data dependencies will be solved (ccm.get)
       * @returns {Promise}
       */
      solveDependencies: ( obj, instance, data_only ) => new Promise( ( resolve, reject ) => {

        obj = self.helper.clone( obj );
        if ( !self.helper.isObject( obj ) && !Array.isArray( obj ) ) return resolve( obj );
        let failed = false;
        let counter = 1;
        search( obj );
        check();

        function search( obj ) {
          if ( self.helper.isSpecialObject( obj ) ) return;
          for ( const key in obj )
            if ( obj.hasOwnProperty( key ) )
              if ( key !== 'ignore' ) {
                const value = obj[ key ];
                if ( self.helper.isDependency( value ) && ( !data_only || value[ 0 ] === 'ccm.get' ) ) {
                  counter++;
                  self.helper.solveDependency( obj[ key ], instance )
                    .then ( result => {                obj[ key ] = result; check(); } )
                    .catch( result => { failed = true; obj[ key ] = result; check(); } );
                }
                else if ( self.helper.isObject( value ) || Array.isArray( value ) )
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
        if ( !self.helper.isDependency( dependency ) ) return dependency;

        // prevent changes via original reference
        dependency = self.helper.clone( dependency );

        /**
         * ccm operation to be performed
         * @type {string}
         */
        const operation = dependency.shift().substr( 'ccm.'.length );

        // solve dependency
        switch ( operation ) {
          case 'load':
            instance && setContext( dependency );
            return await self.load.apply( null, dependency );
          case 'component':
          case 'instance':
          case 'proxy':
          case 'start':
          case 'store':
          case 'get':
          case 'set':
          case 'del':
            if ( !dependency[ 1 ] ) dependency[ 1 ] = {};
            dependency[ 1 ] = await self.helper.solveDependency( dependency[ 1 ], instance );
            if ( instance ) dependency[ 1 ].parent = instance;
            return await self[ operation ].apply( null, dependency );
        }

        /**
         * load resources in Shadow DOM of given ccm instance
         * @param {Array} resources
         */
        function setContext( resources ) {
          for ( let i = 0; i < resources.length; i++ ) {
            if ( Array.isArray( resources[ i ] ) ) { setContext( resources[ i ] ); continue; }
            if ( !self.helper.isObject( resources[ i ] ) ) resources[ i ] = { url: resources[ i ] };
            if ( !resources[ i ].context ) resources[ i ].context = instance.element.parentNode;
          }
        }

      },

      /**
       * transforms a flat object which has dot notation in it's keys as path to deeper properties to an object with deeper structure
       * @param {Object} obj
       * @returns {Object}
       */
      solveDotNotation: function ( obj ) {

        for ( const key in obj )
          if ( key.indexOf( '.' ) !== -1 ) {
            self.helper.deepValue( obj, key, obj[ key ] );
            delete obj[ key ];
          }
        return obj;

      },

      /**
       * transforms an object with deeper structure to a flat object with dot notation in each key as path to deeper properties
       * @param {Object} obj
       * @returns {Object}
       */
      toDotNotation: function ( obj ) {

        const result = {};
        recursive( obj, '' );
        return result;

        function recursive( obj, prefix ) {

          for ( const key in obj )
            if ( typeof obj[ key ] === 'object' )
              recursive( obj[ key ], prefix + key + '.' );
            else
              result[ prefix + key ] = obj[ key ];

        }

      },

      toJSON: function ( value ) {
        return JSON.parse( JSON.stringify( value ) );
      },

      transformStringArray: function ( arr ) {

        var obj = {};
        arr.map( function ( value ) { obj[ value ] = true } );
        return obj;

      },

      /**
       * unescapes HTML characters of a string value
       * @param {string} value - string value
       * @returns {string}
       */
      unescapeHTML: value => {

        const element = document.createElement( 'div' );
        return value.replace( /\&[#0-9a-z]+;/gi, x => {
          element.innerHTML = x;
          return element.innerText;
        } );

      },

      /**
       * @summary performs a function after a waiting time
       * @param {number} time - waiting time in milliseconds
       * @param {function} callback - performed function after waiting time
       * @example ccm.helper.wait( 1000, function () { console.log( 'I was called after 1 second' ) } );
       */
      wait: function ( time, callback ) {
        window.setTimeout( callback, time );
      }

    }

  };

  /**
   * @summary timeout limit (in ms) for loading a resource
   * @memberOf ccm
   * @type {number}
   */
  self.load.timeout = 10000;

  // set framework version specific namespace
  if ( self.version && !ccm[ self.version() ] ) ccm[ self.version() ] = self;

  // update namespace for latest framework version
  if ( !ccm.version || self.helper.compareVersions( self.version(), ccm.version() ) > 0 ) { ccm.latest = self; Object.assign( ccm, self.helper.clone( self ) ); }

  /**
   * prepares a ccm instance configuration
   * @param {Object} [config={}] - instance configuration
   * @param {Object} [defaults={}]  - default instance configuration from component object
   * @returns {Promise}
   */
  async function prepareConfig( config={}, defaults={} ) {

    // config is given as ccm dependency? => solve it
    config = await self.helper.solveDependency( config );

    // starting point is default instance configuration from component object
    let result = defaults;

    // integrate base configuration (config key property)
    result = self.helper.integrate( await self.helper.solveDependency( config.key ), result ); delete config.key;

    // integrate instance configuration
    result = self.helper.integrate( config, result );

    return result;
  }

  /*
   * @namespace ccm.types
   * @summary <i>ccm</i> type definitions
   */

  /*
   * @typedef {function|string|Array} ccm.types.action
   * @summary <i>ccm</i> action data
   * @example function() { ... }
   * @example functionName
   * @example 'functionName'
   * @example 'my.namespace.functionName'
   * @example ['my.namespace.functionName','param1','param2']
   */

  /*
   * @typedef {namespace} ccm.types.component
   * @summary <i>ccm</i> component object
   * @description Below you see typically (but not all mandatory) properties. Most of these properties are set by the <i>ccm</i> framework.
   * @property {ccm.types.index} index - <i>ccm</i> component index
   * @property {ccm.types.name} name - <i>ccm</i> component name
   * @property {ccm.types.version} version - <i>ccm</i> component version number
   * @property {ccm.types.config} config - default configuration for own <i>ccm</i> instances
   * @property {function} Instance - constructor for creating <i>ccm</i> instances out of this component
   * @property {function} ready - callback when this component is registered (deleted after one-time call)
   * @property {function} instance - creates an <i>ccm</i> instance out of this component
   * @property {function} start - creates and starts an <i>ccm</i> instance
   * @property {number} instances - number of own created <i>ccm</i> instances
   * @example {
   *   index:     'chat-2.1.3',
   *   name:      'chat',
   *   version:   [ 2, 1, 3 ],
   *   config:    {...},
   *   Instance:  function () {...},
   *   init:      function ( callback ) { ...; callback(); },
   *   ready:     function ( callback ) { ...; callback(); },
   *   instance:  function ( config, callback ) {...},
   *   start:     function ( config, callback ) {...},
   *   instances: 0
   * }
   */

  /*
   * @typedef {Object} ccm.types.config
   * @summary <i>ccm</i> instance configuration
   * @description Below you see typically (but not mandatory) properties.
   * @property {ccm.types.element} element - <i>ccm</i> instance website area
   * @property {ccm.types.dependency} html - <i>ccm</i> datastore for html templates
   * @property {ccm.types.dependency} style - CSS styles for own website area
   * @property {string} classes - html classes for own website area
   * @property {ccm.types.dependency} store - <i>ccm</i> datastore that contains the dataset for rendering
   * @property {ccm.types.key} key - key of dataset for rendering
   * @property {ccm.types.dependency} lang - <i>ccm</i> instance for multilingualism
   * @property {ccm.types.dependency} user - <i>ccm</i> instance for user authentication
   * @example {
   *   element: jQuery( '#container' ),
   *   html:    [ ccm.store, { local: 'templates.json' } ],
   *   style:   [ ccm.load, 'style.css' ],
   *   classes: 'ccm-chat_snow'
   *   store:   [ ccm.store, { url: 'ws://ccm2.inf.h-brs.de/index.js', store: 'chat' } ],
   *   key:     'test',
   *   lang:    [ ccm.instance, 'https://kaul.inf.h-brs.de/ccm/components/lang.js', {
   *     store: [ ccm.store, 'translations.json' ]
   *   } ],
   *   user:    [ ccm.instance, 'https://kaul.inf.h-brs.de/ccm/components/user.js' ]
   * }
   */

  /*
   * @typedef {Object} ccm.types.dataset
   * @summary <i>ccm</i> dataset
   * @description
   * Every <i>ccm</i> dataset has a property 'key' which contains the unique key of the dataset.
   * There are no conventions for other properties. They can be as they want.
   * @example {
   *   "key": "demo",
   *   "text": "Hello, World!",
   *   "value": "4711"
   * }
   * @example {
   *   "key": "my_first_video_rating",
   *   "likes": {                       // users which clicks like button
   *     "akless": true,
   *     "hunny84": true
   *   },
   *   "dislikes": {                    // user which clicks dislike button
   *     "negativguy": true
   *   }
   * }
   * @example {
   *   "key": "fruit_game_settings",
   *   "max_player": 2,
   *   "fruits": [
   *     {
   *       "name": "Apple",
   *       "points": 50
   *     },
   *     {
   *       "name": "Pear",
   *       "points": 30
   *     }
   *   ]
   * }
   */

  /*
   * @typedef {Object.<ccm.types.key, ccm.types.dataset>} ccm.types.datasets
   * @summary collection of <i>ccm</i> datasets
   * @example {
   *   "demo": {
   *     "key": "demo",
   *     "text": "Hello, World!",
   *     "value": "4711"
   *   },
   *   "test": {
   *     "key": "test",
   *     "text": "My test dataset.",
   *     "value": "abc"
   *   }
   * }
   */

  /*
   * @summary callback when an delete operation is finished
   * @callback ccm.types.delResult
   * @param {ccm.types.dataset} result - deleted dataset
   * @example function () { console.log( result ); }
   */

  /*
   * @typedef {ccm.types.action} ccm.types.dependency
   * @summary <i>ccm</i> dependency
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
   * @typedef {Object} ccm.types.element
   * @summary "jQuery Element" object
   * @description For more informations about jQuery see ({@link https://jquery.com}).
   * @example var element = jQuery( 'body' );
   * @example var element = jQuery( '#menu' );
   * @example var element = jQuery( '.entry' );
   */

  /*
   * @callback ccm.types.getResult
   * @summary callback when a read operation is finished
   * @param {ccm.types.dataset|ccm.types.dataset[]} result - requested dataset(s)
   * @example function ( result ) { console.log( result ) }
   */

  /*
   * @typedef {Object} ccm.types.html
   * @summary <i>ccm</i> html data - TODO: explain properties of <i>ccm</i> html data
   * @ignore
   */

  /*
   * @typedef {string} ccm.types.index
   * @summary <i>ccm</i> component index (unique in <i>ccm</i> framework)
   * @description An <i>ccm</i> component index is made up of a [component name]{@link ccm.types.name} and its [version number]{@link ccm.types.version}.
   * @example "blank-1.0.0"
   * @example "chat-2.1.3"
   * @example "blank" // no version number means latest version
   * @example "chat"
   */

  /*
   * @typedef {Object} ccm.types.instance
   * @summary <i>ccm</i> instance
   * @property {number} id - <i>ccm</i> instance id (unique in own component)
   * @property {string} index - <i>ccm</i> instance index (unique in <i>ccm</i> framework)<br>A <i>ccm</i> instance index is made up of own [component name]{@link ccm.types.name} and own [id]{@link ccm.types.instance} (example: <code>"chat-1"</code>).
   * @property {ccm.types.component} component - reference to associated <i>ccm</i> component
   * @property {ccm.types.dependency} dependency - own dependency
   * @property {function} init - callback when this <i>ccm</i> instance is created and before dependencies of dependent resources are solved
   * @property {function} ready - callback when all dependencies of dependent resources are solved
   * @property {function} start - start instance
   */

  /*
   * @typedef {Object} ccm.types.JqXHR
   * @summary "jQuery XMLHttpRequest" object
   */

  /*
   * @typedef {string|number} ccm.types.key
   * @summary key of a <i>ccm</i> dataset (unique in the <i>ccm</i> datastore which contains the dataset)
   * @description Must be conform with the regular expression /^[a-z_0-9][a-zA-Z_0-9]*$/.
   * @example "test"
   * @example "_foo"
   * @example 4711
   * @example "1_ABC___4711"
   * @example "123"
   * @example "_"
   */

  /*
   * @typedef {string} ccm.types.name
   * @summary name of a <i>ccm</i> component (unique in a <i>ccm</i> component market place)
   * @description Must be conform with the regular expression /^[a-z][a-z_0-9]*$/.
   * @example "blank"
   * @example "chat"
   * @example "my_blank"
   * @example "chat2"
   * @example "bank_001"
   */

  /*
   * @typedef {Object} ccm.types.node
   * @summary HTML node
   * @description For more informations see ({@link http://www.w3schools.com/jsref/dom_obj_all.asp}).
   */

  /*
   * @typedef {Object} ccm.types.resource
   * @summary <i>ccm</i> resource data
   * @property {string} url - URL of the resource
   * @property {Element} [context=document.head] - context in which the resource should be loaded (default is <head>)
   * @property {string} [method='POST'] - HTTP method to use: 'GET', 'POST', 'JSONP' or 'fetch' (default is 'POST')
   * @property {Object} [params] - HTTP parameters to send (in the case of a data exchange)
   * @property {obj} [attr] - HTML attributes to be set for the HTML tag that loads the resource
   * @property {boolean} [ignore_cache] - ignore any result already cached by <i>ccm</i>
   */

  /*
   * @callback ccm.types.setResult
   * @summary callback when an create or update operation is finished
   * @param {ccm.types.dataset} result - created or updated dataset
   * @example function ( result ) { console.log( result ) }
   */

  /*
   * @typedef {Object} ccm.types.settings
   * @summary <i>ccm</i> datastore settings
   * @description
   * Settings for a <i>ccm</i> datastore.
   * For more informations about providing a <i>ccm</i> datastore see the [documentation of the method 'ccm.store']{@link ccm.store}.
   * The data level in which the stored datasets will managed is dependent on the existing properties in the datastore settings.
   * No property 'store' results in a <i>ccm</i> datastore of data level 1.
   * An existing property 'store' results in a <i>ccm</i> datastore of data level 2.
   * An existing property 'store' and 'url' results in a <i>ccm</i> datastore of data level 3.
   * @property {ccm.types.datasets|ccm.types.url} local - Collection of initial <i>ccm</i> datasets or URL to a json file that deliver initial datasets for local cache.
   * See [this wiki page]{@link https://github.com/akless/ccm-developer/wiki/Data-Management#data-caching} for more informations about this kind of data caching.
   * @property {string} store - Name of the datastore in the database.
   * Dependent on the specific database the datastore has different designations.
   * For example in IndexedDB this is the name of the Object Store, in MongoDB the name of the Document Store and in MySQL the name of the Table.
   * This property is not relevant for the first data level. It is only relevant for higher data levels.
   * @property {string} url - URL to an <i>ccm</i> compatible server interface.
   * This property is only relevant for the third data level.
   * See [this wiki page]{@link https://github.com/akless/ccm-developer/wiki/Data-Management#server-interface} for more informations about an <i>ccm</i> compatible server interface.
   * @property {string} db - database (in case of a server that offers more than one database)
   * @property {function} onchange - Callback when server informs about changed stored datasets.
   * This property is only relevant for the third data level with real-time communication.
   * See [this wiki page]{@link https://github.com/akless/ccm-developer/wiki/Data-Management#real-time-communication} for more informations.
   * @property {ccm.types.instance} user - <i>ccm</i> instance for user authentication (not documented yet) | TODO: Wiki page for datastore security
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
   * @param {ccm.Datastore} store - <i>ccm<i/> datastore
   * @example function ( store ) { console.log( store ) }
   */

  /*
   * @typedef {string} ccm.types.url
   * @summary Uniform Resource Locator (URL)
   * @example https://github.com/akless/ccm-developer
   * @example ws://ccm2.inf.h-brs.de/index.js:80
   * @example http://akless.github.io/ccm-developer/resources/ccm.chat.min.js
   */

  /*
   * @typedef {string} ccm.types.version
   * @summary version number conform with Semantic Versioning 2.0.0 ({@link http://semver.org})
   * @example '1.0.0'
   * @example '2.1.3'
   */

} )();