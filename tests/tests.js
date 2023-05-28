/**
 * @overview unit tests for the ccm framework
 * @author André Kless <andre.kless@web.de> 2016-2018
 * @license The MIT License (MIT)
 */

ccm.files[ 'tests.js' ] = {
  setup: suite => {
    suite.$ = suite.ccm.helper;
  },
  helper: {
    isSubset: {
      setup: suite => {
        suite.other = {
          name: 'John Doe',
          counter: 3,
          isValid: true,
          values: [ 'abc', 123, false ],
          settings: { title: 'Welcome!', year: 2017, greedy: true },
          onLoad: () => console.log( 'Loading..' ),
          search: '>aba<'
        };
      },
      tests: {
        'checkWithNull1': suite => suite.assertTrue( suite.$.isSubset( { title: null }, suite.other ) ),
        'checkWithNull2': suite => suite.assertFalse( suite.$.isSubset( { name: null }, suite.other ) ),
        'checkWithTrue1': suite => suite.assertTrue( suite.$.isSubset( { name: true }, suite.other ) ),
        'checkWithTrue2': suite => suite.assertFalse( suite.$.isSubset( { title: true }, suite.other ) ),
        'checkWithRegex1': suite => suite.assertTrue( suite.$.isSubset( { name: '/^J\\w+ D\\w+$/' }, suite.other ) ),
        'checkWithRegex2': suite => suite.assertFalse( suite.$.isSubset( { name: '/^J\\W+ D\\W+$/' }, suite.other ) ),
        'checkObjWithJsonStringify1': suite => suite.assertTrue( suite.$.isSubset( { settings: { title: 'Welcome!', year: 2017, greedy: true } }, suite.other ) ),
        'checkObjWithJsonStringify2': suite => suite.assertFalse( suite.$.isSubset( { settings: { title: 'Welcome!', year: '2017', greedy: true } }, suite.other ) ),
        'checkArrayWithJsonStringify1': suite => suite.assertTrue( suite.$.isSubset( { values: [ 'abc', 123, false ] }, suite.other ) ),
        'checkArrayWithJsonStringify2': suite => suite.assertFalse( suite.$.isSubset( { values: [ 'abc', '123', false ] }, suite.other ) ),
        'checkDeeperObjProp1': suite => suite.assertTrue( suite.$.isSubset( { 'settings.year': 2017 }, suite.other ) ),
        'checkDeeperObjProp2': suite => suite.assertFalse( suite.$.isSubset( { 'settings.year': '2017' }, suite.other ) ),
        'checkDeeperArrayElem1': suite => suite.assertTrue( suite.$.isSubset( { 'values.1': 123 }, suite.other ) ),
        'checkDeeperArrayElem2': suite => suite.assertFalse( suite.$.isSubset( { 'values.1': '124' }, suite.other ) ),
        'checkProp1': suite => suite.assertTrue( suite.$.isSubset( { counter: 3 }, suite.other ) ),
        'checkProp2': suite => suite.assertFalse( suite.$.isSubset( { counter: '3' }, suite.other ) ),
        'checkSubset1': suite => suite.assertTrue( suite.$.isSubset( { name: true, counter: 3, isValid: true, title: null }, suite.other ) ),
        'checkSubset2': suite => suite.assertFalse( suite.$.isSubset( { name: true, counter: '3', isValid: true, title: null }, suite.other ) ),
        'checkFunc1': suite => suite.assertTrue( suite.$.isSubset( { onLoad: suite.other.onLoad }, suite.other ) ),
        'checkFunc2': suite => suite.assertFalse( suite.$.isSubset( { onLoad: () => console.log( 'Loading..' ) }, suite.other ) ),
        'checkEmpty': suite => suite.assertTrue( suite.$.isSubset( {}, suite.other ) )
      }
    }
  }
};