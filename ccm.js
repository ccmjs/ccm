/**
 * @overview ccm framework
 * @author André Kless <andre.kless@web.de> 2014-2020
 * @license The MIT License (MIT)
 * @version latest (25.0.0)
 * @changes
 * version 25.0.0 (20.01.2020)
 * - moved not framework-relevant helper functions to extern ES6 module
 * - bug fix for checking expired token
 * - import property for loading a function can be given by URL hash code
 * - added support of 'beforeCreation', 'afterCreation' and 'onReady' callback in config
 * - removed loading icon as initial content
 * - each instance knows his Shadow DOM via property 'shadow'
 * - bug fix for throw exception on invalid component filename in ccm.helper.convertComponentURL
 * - bug fix for ignore of comments in HTML templates
 * - ccm.helper.html can process SVG tags inside of ccm HTML data
 * - correct detection of HTML boolean attributes
 * - bug fix for solving dependencies when linked config no more exists
 * - bug fix for ccm.helper.toDotNotation on special objects
 * - bug fix for ccm.get dependencies with a string as store settings
 * - bug fix for reacting on invalid token on websocket connection
 * (for older version changes see ccm-24.2.0.js)
 */

( () => {

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

        // no change callback and not a standalone datastore? => set default change callback: restart parent
        if ( !that.onchange && that.parent ) that.onchange = that.parent.start;

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
          const {callback,data} = self.helper.parse( message.data );

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

        // get local dataset(s) from local cache
        resolve( self.helper.clone( self.helper.isObject( key_or_query ) ? runQuery( key_or_query ) : that.local[ key_or_query ] ) );

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

        const store = getStore();
        const request = self.helper.isObject( key_or_query ) ? store.getAll() : store.get( key_or_query );
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
      priodata = self.helper.toJSON( priodata );

      // priority data has no key? => generate unique key
      if ( !priodata.key ) priodata.key = self.helper.generateKey();

      // priority data contains invalid key? => abort
      if ( !self.helper.isKey( priodata.key ) ) reject( new Error( 'invalid dataset key: ' + priodata.key ) );

      // detect managed data level
      that.url ? serverDB() : ( that.name ? clientDB() : localCache() );

      /** creates/updates dataset in local cache */
      async function localCache() {

        // dataset already exists? => update
        if ( that.local[ priodata.key ] ) that.local[ priodata.key ] = await self.helper.integrate( priodata, that.local[ priodata.key ] );

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

        ( that.socket ? useWebsocket : useHttp )( prepareParams( { set: priodata } ) ).then( response => ( response.toString() === priodata.key.toString() ? resolve : reject )( response ) ).catch( error => checkError( error, reject ) );

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

        ( that.socket ? useWebsocket : useHttp )( prepareParams( { del: key } ) ).then( response => ( response === true ? resolve : reject )( response ) ).catch( error => checkError( error, reject ) );

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
      user = self.context.find( that, 'user' );
      if ( user && user.isLoggedIn() ) {
        params.realm = user.getRealm();
        params.token = user.data().token;
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
      if ( error && ( error === 401 || error.data && error.data.status === 401 ) && user ) {
        try {
          await user.logout();
          await user.login();
          await self.context.root( user ).start();
        }
        catch ( e ) {
          await self.context.root( user ).start();
        }
      }
      else
        reject( error );
    }

    /**
     * sends data to server interface via websocket connection
     * @param {Object} params - data to be sent to server
     * @returns {Promise}
     */
    function useWebsocket( params ) { return new Promise( resolve => {

      const key = self.helper.generateKey();
      callbacks[ key ] = result => Number.isInteger( result ) ? result => checkError( result, reject ) : resolve;
      params.callback = key;
      that.socket.send( self.helper.stringify( params ) );

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
    version: () => '25.0.0',

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
          const suffix = resource.url.split( '.' ).pop().split( '?' ).shift().split( '#' ).shift().toLowerCase();

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
          let timeout; self.load.timeout && window.setTimeout( () => timeout === undefined && ( timeout = true ) && error( 'timeout' ), self.load.timeout );

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
              case 'html':   return loadHTML;
              case 'image':  return loadImage;
              case 'css':    return loadCSS;
              case 'js':     return loadJS;
              case 'module': return loadModule;
              case 'xml':    return loadXML;
              case 'data':   return loadData;
            }

            switch ( suffix ) {
              case 'html':
                return loadHTML;
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
              case 'mjs':
                return loadModule;
              case 'xml':
                return loadXML;
              default:
                return loadData;
            }

          }

          /** loads a HTML file */
          function loadHTML() {

            // load HTML via HTTP GET request
            resource.type = 'html';
            resource.method = 'get';
            loadData();

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

            // already exists in same context? => abort
            if ( resource.context.querySelector( 'link[rel="stylesheet"][type="text/css"][href="' + resource.url + '"]' ) ) return success();

            // load the CSS file via a <link> element
            let element = { tag: 'link', rel: 'stylesheet', type: 'text/css', href: resource.url };
            if ( resource.attr ) element = Object.assign( element, resource.attr );
            element = self.helper.html( element );
            element.onload  = success;
            element.onerror = event => { element.parentNode.removeChild( element ); error( element, event ); };
            resource.context.appendChild( element );

          }

          /** loads (and executes) a JavaScript file */
          function loadJS() {

            /**
             * filename of JavaScript file (without '.min')
             * @type {string}
             */
            const filename = resource.url.split( '/' ).pop().split( '?' ).shift().replace( '.min.', '.' );

            // mark JavaScript file as loading
            ccm.files[ filename ] = null; ccm.files[ '#' + filename ] = ccm.files[ '#' + filename ] ? ccm.files[ '#' + filename ] + 1 : 1;

            // load the JavaScript file via a <script> element
            let element = { tag: 'script', src: resource.url };
            if ( resource.attr ) element = Object.assign( element, resource.attr );
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
              element.parentNode.removeChild( element );

              // perform success callback
              data !== null ? successData( data ) : success();

            };
            element.onerror = event => { element.parentNode.removeChild( element ); error( element, event ); };
            resource.context.appendChild( element );

          }

          /** loads a JavaScript module */
          function loadModule() {
            const callback = 'callback' + self.helper.generateKey();
            ccm.callbacks[ callback ] = function ( result ) {
              element.parentNode.removeChild( element );
              delete ccm.callbacks[ callback ];
              successData( result );
            };
            const element = self.helper.html( { tag: 'script', type: 'module' } );
            element.onerror = event => { element.parentNode.removeChild( element ); error( element, event ); };
            const split = resource.url.split( '#' );
            if ( !resource.import && split.length > 1 ) resource.import = split[ 1 ];
            element.text = "import * as alias from '" + split[ 0 ] + "'; ccm.callbacks['" + callback + "']( alias" + ( resource.import ? '.' + resource.import : '' ) + " )";
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
              const callback = 'callback' + self.helper.generateKey();
              if ( !resource.params ) resource.params = {};
              resource.params.callback = 'ccm.callbacks.' + callback;
              ccm.callbacks[ callback ] = data => {
                element.parentNode.removeChild( element );
                delete ccm.callbacks[ callback ];
                successData( data );
              };

              // prepare <script> element for data exchange
              let element = { tag: 'script', src: buildURL( resource.url, resource.params ) };
              if ( resource.attr ) element = Object.assign( element, resource.attr );
              element = self.helper.html( element );
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
              request.send( resource.method === 'post' || resource.method === 'put' ? self.helper.stringify( resource.params ) : undefined );
            }

            /** performs a data exchange via fetch API */
            function fetchAPI() {
              if ( !resource.init ) resource.init = {};
              if ( resource.params ) resource.init.method.toLowerCase() === 'post' ? resource.init.body = self.helper.stringify( resource.params) : resource.url = buildURL( resource.url, resource.params );
              fetch( resource.url, resource.init ).then( response => response.text() ).then( successData ).catch( error );
            }

            /**
             * adds HTTP parameters in URL
             * @param {string} url - URL
             * @param {Object} data - HTTP parameters
             * @returns {string} URL with added HTTP parameters
             */
            function buildURL( url, data ) {
              if ( self.helper.isObject( data.json ) ) data.json = self.helper.stringify( data.json );
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
            if ( typeof data === 'string' && self.helper.regex( 'json' ).test( data ) ) try { data = self.helper.parse( data ); } catch ( e ) {}

            // received data is a HTML string? => transform to ccm HTML data
            if ( resource.type === 'html' ) data = self.helper.html2json( data );

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
      if ( !self.helper.isComponent( component ) ) throw new Error( 'invalid component object' );

      // used framework version could be set via config
      await changeFrameworkVersion( component, config );

      // load needed ccm framework version and remember version number
      const version = ( self.helper.isFramework( component.ccm ) ? component.ccm : await self.helper.loadFramework( component.ccm ) ).version();

      // component uses other framework version? => register component via other framework version (and considers backward compatibility)
      if ( version !== self.version() ) return new Promise( async resolve => {
        const result = await ccm[ version ].component( component, config, resolve );
        result && resolve( result );
      } );

      // set component index
      component.index = component.name + ( component.version ? '-' + component.version.join( '-' ) : '' );

      // component not registered? => register component
      if ( !components[ component.index ] ) {

        // register component
        components[ component.index ] = component;

        // create global component namespaces
        self.components[ component.index ] = {};

        component.instances = 0;         // add ccm instance counter
        component.ccm = ccm[ version ];  // add ccm framework reference

        // initialize component
        component.ready && await component.ready.call( component ); delete component.ready;

        // define HTML tag for component
        await defineCustomElement( component.index );

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
          const index = component.endsWith( '.js' ) ? self.helper.convertComponentURL( component ).index : component;

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
      component = await self.component( component, { ccm: config && config.ccm } ); config && delete config.ccm;

      // prepare ccm instance configuration
      config = await prepareConfig( config, component.config );

      // perform 'beforeCreation' callback
      config.beforeCreation && await config.beforeCreation( config, self.helper.clone( component ) ); delete config.beforeCreation;

      // no component object? => abort
      if ( !self.helper.isComponent( component ) ) return component;

      // component uses other framework version? => create instance via other framework version (and considers backward compatibility)
      if ( component.ccm.version() !== self.version() ) return new Promise( async resolve => {
        const result = await ccm[ component.ccm.version() ].instance( component, config, resolve );
        result && resolve( result );
      } );

      /**
       * created and prepared ccm instance
       * @type {ccm.types.instance}
       */
      let instance = createInstance();

      // perform 'afterCreation' callback
      config.afterCreation && await config.afterCreation( config, self.helper.clone( component ) ); delete config.afterCreation;

      // each instance knows his original config
      instance.config = self.helper.stringify( config );

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
      config.inner = self.helper.html( config.inner, undefined, { no_evaluation: true } );

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

          // root is a string? => use inner website area of the parent where HTML ID is equal to given string or component name (if root is keyword 'name')
          if ( typeof instance.root === 'string' ) instance.root = instance.parent.element.querySelector( '#' + ( instance.root === 'name' && instance.parent ? component.name : instance.root ) );

          /**
           * root element of ccm instance
           * @type {Element}
           */
          const root = self.helper.html( { id: instance.index } );

          // set root element
          if ( instance.root ) { instance.root.innerHTML = ''; instance.root.appendChild( root ); instance.root = root; }

          // handle Shadow DOM
          if ( !config.shadow ) config.shadow = 'closed';
          if ( typeof config.shadow === 'string' && config.shadow !== 'none' ) {
            instance.shadow = root.shadowRoot || root.attachShadow( { mode: config.shadow } );
            delete config.shadow;
          }

          // set content element
          ( instance.shadow || root ).appendChild( instance.element = self.helper.html( { id: 'element' } ) );

          if ( !instance.root ) instance.root = root;

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
                if ( self.helper.regex( 'json' ).test( value ) ) value = self.helper.parse( value );
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
            next.ready ? next.ready().then( () => { delete next.ready; ready(); } ) : ready();

            // does the app have to be started directly? => do it
            if ( next._start ) { delete next._start; next.start(); }

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
      obj.start = async cfg => await Object.assign( obj, await self.instance( component, await self.helper.integrate( cfg, config ) ) ).start();
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
      if ( !self.helper.isInstance( instance ) ) return instance;
      instance.init ? ( instance._start = true ) : await instance.start();
      return instance;
    },

    /**
     * @summary provides a ccm datastore
     * @param {Object} [config={}] - ccm datastore configuration
     * @returns {Promise}
     */
    store: ( config = {} ) => new Promise( ( resolve, reject ) => {

      // no manipulation of passed original parameter (avoids unwanted side effects)
      config = self.helper.clone( config );

      // is string? => use passed parameter as datastore name or path to a JavaScript file that contains initial data for local cache
      if ( typeof config === 'string' ) config = config.split( '?' ).shift().endsWith( '.js' ) ? { local: [ 'ccm.load', config ] } : { name: config };

      // is no datastore configuration? => use passed parameter for initial local cache
      if ( !self.helper.isObject( config ) || ( !config.local && !config.name ) ) { config = { local: config, parent: config.parent }; delete config.local.parent; }

      // no initial local cache? => use empty object
      if ( !config.local && !config.name ) config.local = {};

      // initial local cache is given as ccm dependency? => solve dependency
      self.helper.solveDependency( config.local ).then( result => { config.local = result;

        // local cache is given as array? => convert to object
        if ( Array.isArray( config.local ) ) config.local = self.helper.arrToStore( config.local );

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
          if ( self.helper.isObject( instance ) && instance[ property ] !== undefined && instance[ property ] !== start )
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
        do
          if ( self.helper.isObject( instance ) && instance[ property ] !== undefined && instance[ property ] !== start )
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
        do
          if ( self.helper.isObject( instance ) && instance[ property ] !== undefined && instance[ property ] !== start )
            return instance;
        while ( instance = instance.parent );
        return null;

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
       * @summary converts an array of datasets to a collection of <i>ccm</i> datasets
       * @param {ccm.types.dataset[]} arr - array of datasets
       * @returns {ccm.types.datasets} collection of <i>ccm</i> datasets
       */
      arrToStore: arr => {

        if ( !Array.isArray( arr ) ) return;

        const obj = {};
        arr.forEach( value => {
          if ( self.helper.isDataset( value ) )
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
        if ( !self.helper.regex( 'filename' ).test( filename ) ) throw new Error( 'invalid component filename: ' + filename );

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
        const obj_mode = self.helper.isObject( data );

        // convert given values to real array
        values = self.helper.clone( [ ...arguments ] ); values.shift();

        // convert data to string
        data = self.helper.stringify( data, ( key, val ) => {

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
        return self.helper.parse( data, ( key, val ) => {

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
        element = self.helper.html( element, undefined, { no_evaluation: true } );

        // innerHTML is a JSON string? => move it to attribture 'inner'
        if ( self.helper.regex( 'json' ).test( element.innerHTML ) ) { element.setAttribute( 'inner', element.innerHTML ); element.innerHTML = ''; }

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
                obj[ attr.name ] = attr.value.charAt( 0 ) === '{' || attr.value.charAt( 0 ) === '[' ? self.helper.parse( attr.value ) : prepareValue( attr.value );
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
                  self.helper.deepValue( config, split[ 2 ], interpretLoadTag( child, split[ 2 ] ) );
                  break;
                case 'component':
                case 'instance':
                case 'proxy':
                  self.helper.deepValue( config, split[ 2 ], [ 'ccm.' + split[ 1 ], child.getAttribute( 'src' ) || split[ 2 ], self.helper.generateConfig( child ) ] );
                  break;
                case 'store':
                case 'get':
                  const settings = {};
                  catchAttributes( child, settings );
                  const key = settings.key;
                  delete settings.key;
                  self.helper.deepValue( config, split[ 2 ], [ 'ccm.' + split[ 1 ], settings, key ] );
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
                        self.helper.deepValue( list, split[ 2 ], value );
                    }
                  } );
                  if ( !list ) list = {};
                  catchAttributes( child, list );
                  if ( list ) self.helper.deepValue( config, split[ 2 ], list );
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
          config.inner = self.helper.html( {} );
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

        return Date.now() + 'X' + Math.random().toString().substr( 2 );

      },

      /**
       * converts HTML to ccm HTML data
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

          // contains many HTML templates? => convert to object (each property contains a HTML template)
          if ( html.firstChild.tagName === 'CCM-TEMPLATE' ) {
            const result = html.firstChild.getAttribute( 'key' ) ? {} : [];
            [ ...html.childNodes ].forEach( ( child, i ) => {
              if ( child.tagName !== 'CCM-TEMPLATE' ) return;
              const key = child.getAttribute( 'key' );
              result[ key || i ] = child = self.helper.html2json( child );  // recursive call
              delete child.key; delete child.tag;
              if ( !Array.isArray( child.inner ) )
                result[ key || i ] = child.inner;
            } );
            return result;
          }

          // only one child? => use child as root element
          if ( html.childNodes.length === 1 )
            html = html.firstChild;

        }

        // no HTML Element? => return it as result
        if ( !self.helper.isElement( html ) ) return html;

        // catch tag name
        if ( html.tagName ) json.tag = html.tagName.toLowerCase();
        if ( json.tag === 'div' ) delete json.tag;

        // catch HTML attributes
        html.attributes && [ ...html.attributes ].forEach( attr => json[ attr.name ] = attr.value === '' ? true : attr.value );

        // catch inner HTML (recursive)
        [ ...html.childNodes ].forEach( child => {
          if ( child.nodeType === Node.COMMENT_NODE )
            return child.parentNode.removeChild( child );
          if ( child.nodeValue )
            child.nodeValue = child.nodeValue.replace( /\s+/g, ' ' );
          if ( self.helper.isElement( child ) || child.nodeValue.trim() )
            json.inner.push( self.helper.isElement( child ) ? self.helper.html2json( child ) : child.textContent );
        } );
        if ( !json.inner.length )
          delete json.inner;
        else if ( json.inner.length === 1 )
          json.inner = json.inner[ 0 ];

        return json;
      },

      /**
       * transforms HTML to a HTML element and replaces placeholders (recursive)
       * @param {string|ccm.types.html|ccm.types.html[]|Node|jQuery} html
       * @param {...string|Object} [values] - values to replace placeholder
       * @param {Object} [settings] - advanced settings
       * @param {boolean} [settings.no_evaluation] - skips evaluation of ccm HTML elements
       * @param {string} [settings.namespace_uri] - sets namespace URI for created elements
       * @returns {Element|Element[]} HTML element
       */
      html: function ( html, values, settings ) {

        // no HTML? => abort
        if ( !html ) return html;

        // is already a HTML element and no placeholders have to be replaced? => nothing to do
        if ( self.helper.isElement( html ) && values === undefined ) return html;

        // handle advanced settings
        let advanced = {};
        if ( self.helper.isObject( settings ) ) {
          advanced = settings;
          settings = undefined;
        }

        // convert HTML to ccm HTML data
        html = self.helper.html2json( html );

        // clone HTML data
        html = self.helper.clone( html );

        // replace placeholder
        if ( values !== undefined ) html = self.helper.format.apply( this, arguments );

        // get more than one HTML tag?
        if ( Array.isArray( html ) ) {

          // generate each HTML tag
          const result = [];
          for ( let i = 0; i < html.length; i++ )
            result.push( self.helper.html( html[ i ], undefined, advanced ) );  // recursive call
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
        delete html.tag; if ( !self.helper.regex( 'json' ).test( html.key ) ) delete html.key;

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
          const config = self.helper.generateConfig( element );
          config.root = element;
          self.start( element.tagName === 'CCM-APP' ? element.getAttribute( 'component' ) : element.tagName.substr( 4 ).toLowerCase(), config );
        }

        // return generated HTML
        return element;

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

        dataset = self.helper.clone( dataset );

        // no given priority data? => return given dataset
        if ( !self.helper.isObject( priodata ) ) return dataset;

        // no given dataset? => return given priority data
        if ( !self.helper.isObject( dataset ) ) return self.helper.clone( priodata );

        // iterate over priority data properties
        for ( let key in priodata ) {

          // search and solve data dependencies along key path before integration of priority data value
          const split = key.split( '.' );
          let obj = dataset;
          for ( let i = 0; i < split.length; i++ ) {
            const prop = split[ i ];
            if ( self.helper.isDependency( obj[ prop ] ) && obj[ prop ][ 0 ] === 'ccm.get' )
              obj[ prop ] = await self.helper.solveDependency( obj[ prop ] );
            obj = obj[ prop ];
            if ( !obj ) break;
          }

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
      isDatastore: value => self.helper.isObject( value ) && value.get && value.set && value.del && value.source && value.clear && true,

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
      isElement: function ( value ) {

        return value instanceof Element || value instanceof DocumentFragment;
        //return self.helper.isNode( value ) && value.tagName && true;

      },

      /**
       * @summary checks if a value is a <i>ccm</i> framework object
       * @param {*} value - value to check
       * @returns {boolean}
       */
      isFramework: value => self.helper.isObject( value ) && value.components && value.version && true,

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
       * @summary checks if a value is a special object: (Window Object, Node, ccm Framework Object, ccm Instance, ccm Component Object, ccm Datastore, jQuery Object)
       * @param {*} value
       * @returns {boolean}
       */
      isSpecialObject: value => {

        return !!( value === window || self.helper.isNode( value ) || self.helper.isFramework( value ) || self.helper.isInstance( value ) || self.helper.isComponent( value ) || self.helper.isDatastore( value ) || window.jQuery && value instanceof jQuery );

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
       *   x: { y: 'z' },                // check of inner object
       *   'values.1': 123,              // check of deeper array value
       *   'settings.title': 'Welcome!'  // check of deeper object value
       * };
       * const other = {
       *   name: 'John Doe',
       *   counter: 3,
       *   isValid: true,
       *   values: [ 'abc', 123, false ],
       *   settings: { title: 'Welcome!', year: 2017, greedy: true },
       *   x: { y: 'z' },
       *   onLoad: function () { console.log( 'Loading..' ); }
       * };
       * const result = ccm.helper.isSubset( obj, other );
       * console.log( result );  // => true
       */
      isSubset: function ( obj, other ) {

        other = self.helper.toDotNotation( other, true );
        for ( const key in obj )
          if ( typeof obj[ key ] === 'object' && typeof other[ key ] === 'object' ) {
            if ( JSON.stringify( obj[ key ] ) !== JSON.stringify( other[ key ] ) )
              return false;
          }
          else if ( obj[ key ] !== other[ key ] )
            return false;
        return true;

      },

      /**
       * loads a ccm framework version
       * @param {string|{url: string, integrity: string, crossorigin: string}} url - framework version URL
       * @returns {Promise<Object>} namespace of loaded framework version
       */
      loadFramework: async url => {

        // prepare resource data
        let resource = {};
        if ( self.helper.isObject( url ) ) {
          url = self.helper.clone( url );
          resource.url = url.url;
          delete url.url;
          resource.attr = url;
        }
        else resource = { url: url };

        /**
         * framework version number
         * @type {string[]}
         */
        const version = ( resource.url.match( /(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)/ ) || [ 'latest' ] )[ 0 ];

        // load needed ccm framework version if not already there
        !ccm[ version ] && await self.load( resource );

        return ccm[ version ];
      },

      /**
       * logs a ccm-specific message in the browser console
       * @param {*} message
       */
      log: message => console.log( '[ccm]', message ),

      /**
       * converts a JSON string to JSON and removes hidden characters
       * @param {string} string - JSON string
       * @param {function} [reviver]
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
          case 'key':      return /^[a-zA-Z0-9_-]+$/;
          case 'json':     return /^(({(.|\n)*})|(\[(.|\n)*])|true|false|null)$/;
        }

      },

      /**
       * @summary solves ccm dependencies contained in an object or array
       * @param {Object|Array} obj - object or array
       * @param {ccm.types.instance} [instance] - associated ccm instance
       * @returns {Promise}
       */
      solveDependencies: ( obj, instance ) => new Promise( ( resolve, reject ) => {

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
                if ( self.helper.isDependency( value ) ) {
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
          case 'set':
          case 'del':
            dependency[ 1 ] = await self.helper.solveDependency( dependency[ 1 ], instance );
            if ( !dependency[ operation === 'store' ? 0 : 1 ] ) dependency[ operation === 'store' ? 0 : 1 ] = {};
            if ( instance ) dependency[ operation === 'store' ? 0 : 1 ].parent = instance;
            return await self[ operation ].apply( null, dependency );
          case 'store':
          case 'get':
            if ( !dependency[ 0 ] ) dependency[ 0 ] = {};
            if ( instance ) dependency[ 0 ].parent = instance;
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
       * transforms a flat object which has dot notation in it's keys as path to deeper properties to an object with deeper structure (not yet uses in framework)
       * @param {Object} obj
       * @returns {Object}
       */
      solveDotNotation: function ( obj ) {

        obj = self.helper.clone( obj );
        for ( const key in obj )
          if ( key.indexOf( '.' ) !== -1 ) {
            self.helper.deepValue( obj, key, obj[ key ] );
            delete obj[ key ];
          }
        return obj;

      },

      /**
       * converts a value to a JSON string and removes not JSON valid data
       * @param {*} value
       * @param {function} [replacer]
       * @param {string|number} [space]
       * @returns {string} JSON string
       */
      stringify: ( value, replacer, space ) => JSON.stringify( value, ( key, value ) => {
        if ( typeof value === 'function' || self.helper.isSpecialObject( value ) )
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
            if ( typeof obj[ key ] === 'object' && !self.helper.isSpecialObject( obj[ key ] ) ) {
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
      toJSON: value => self.helper.parse( self.helper.stringify( value ) )

    }

  };

  /**
   * @summary timeout limit (in ms) for loading a resource (default: no timeout)
   * @memberOf ccm
   * @type {number}
   */
  self.load.timeout = 0;

  // set framework version specific namespace
  if ( self.version && !ccm[ self.version() ] ) ccm[ self.version() ] = self;

  // update namespace for latest framework version
  if ( !ccm.version || self.helper.compareVersions( self.version(), ccm.version() ) > 0 ) { ccm.latest = self; Object.assign( ccm, self.helper.clone( self ) ); }

  // define Custom Element <ccm-app>
  defineCustomElement( 'app' );

  /**
   * defines a ccm-specific Custom Element
   * @param {string} name - element name (without 'ccm-' prefix)
   * @returns {Promise<void>}
   */
  async function defineCustomElement( name ) {

    // load polyfill for Custom Elements
    if ( !( 'customElements' in window ) ) await self.load( {
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
        const config = self.helper.generateConfig( this );
        this.removeAttribute( 'key' );
        config.root = this;
        await self.start( this.tagName === 'CCM-APP' ? this.getAttribute( 'component' ) : name, config );
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
    config = await self.helper.solveDependency( config );

    // starting point is default instance configuration from component object
    let result = defaults;

    // integrate base configuration (config key property)
    result = await self.helper.integrate( await self.helper.solveDependency( config.key ), result );

    // integrate instance configuration
    result = await self.helper.integrate( config, result );

    // delete reserved properties
    delete result.key;
    delete result.component;

    return result;
  }

  /**
   * changes the component used framework version via config
   * @returns {Promise<void>}
   */
  async function changeFrameworkVersion( component, config ) {

    // should use other ccm framework version? => change used framework version in component object
    const source = config && config.ccm;
    if ( source ) {
      component.ccm = ccm[ ( await self.helper.loadFramework( source ) ).version() ];
      component.ccm.url = self.helper.isObject( source ) ? source.url : source;        // (considers backward compatibility)
      config && delete config.ccm;
    }

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