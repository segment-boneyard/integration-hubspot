
var Test = require('segmentio-integration-tester');
var helpers = require('./helpers');
var facade = require('segmentio-facade');
var mapper = require('../lib/mapper');
var fmt = require('util').format;
var assert = require('assert');
var should = require('should');
var Hubspot = require('..');
var uid = require('uid');

describe('HubSpot', function(){
  var settings;
  var payload;
  var hubspot;
  var test;

  beforeEach(function(){
    payload = {};
    settings = {
      portalId: 62515,
      apiKey: 'demo'
    };
    hubspot = new Hubspot(settings);
    test = Test(hubspot, __dirname);
    test.mapper(mapper);
  });

  it('should have correct settings', function(){
    test
      .name('HubSpot')
      .ensure('settings.portalId')
      .ensure('settings.apiKey')
      .ensure('message.email')
      .channels(['server']);
  });

  describe('.validate()', function(){
    var msg;

    beforeEach(function(){
      msg = {
        properties: {
          email: 'jd@example.com'
        }
      };
    });

    it('should be invalid without portalId', function(){
      delete settings.portalId;
      test.invalid(msg, settings);
    });

    it('should be invalid without apiKey', function(){
      delete settings.apiKey;
      test.invalid(msg, settings);
    });

    it('should be valid with apiKey and portalId', function(){
      test.valid(msg, settings);
    });
  });

  describe('mapper', function(){

    describe('track', function(){
      it('should map basic track', function(){
        test.maps('track-basic', {
          portalId: 'portal-id'
        });
      });
    });

    describe('identify', function(){
      it('should fallback to .jobTitle', function(){
        test.maps('identify-job-title');
      });

      it('should map add createdate', function(){
        test.maps('identify-created');
      });

      it('should grab address traits from .address if possible', function(){
        test.maps('identify-address');
      });

      it('should fallback to .zip', function(){
        test.maps('identify-zip');
      });

      it('should strip null values', function (){
        test.maps('identify-null');
      });

      it('should lowercase traits', function (){
        test.maps('identify-uppercase');
      });

      it('should replace spaces with underscores', function (){
        test.maps('identify-spaces');
      });
    });
  });

  describe('.identify()', function(){

    var email = fmt('test-%s@segment.io', uid());

    it('should create user succesfully', function (done) {

      var json = test.fixture('identify-basic');
      json.input.traits.email = email;

      test
        .identify(json.input)
        .set(settings)
        .request(2)
        .expects(200)
        .end(done);
    });

    it('should format uppercase traits', function (done) {

      var json = test.fixture('identify-uppercase');
      json.input.traits.email = email;

      test
        .identify(json.input)
        .set(settings)
        .request(2)
        .expects(204)
        .end(done);
    });

    it('should format spaces traits', function (done) {

      var json = test.fixture('identify-spaces');
      json.input.traits.email = email;

      test
        .identify(json.input)
        .set(settings)
        .request(2)
        .expects(204)
        .end(done);
    });

    it('should update user lifecycle forward', function (done) {

      var json = test.fixture('identify-basic');

      json.input.traits.email = email;
      json.input.traits.lifecyclestage = 'opportunity';

      test
        .identify(json.input)
        .set(settings)
        .request(2)
        .expects(204)
        .end(done);
    });

    it('should update user lifecycle backward', function (done) {

      var json = test.fixture('identify-basic');

      json.input.traits.email = email;
      json.input.traits.lifecyclestage = 'marketingqualifiedlead';

      test
        .identify(json.input)
        .set(settings)
        .request(3)
        .expects(204)
        .end(done);
    });

    it('should error on invalid user lifecycle', function (done) {

      var json = test.fixture('identify-basic');
      json.input.traits.email = email;
      json.input.traits.lifecyclestage = 'abcdef';

      test
        .identify(json.input)
        .set(settings)
        .error('Bad Request', done);
    });

    it('should identify with "date" objects', function (done) {
      // the hubspot demo key has this as the only "date" type
      var json = test.fixture('identify-basic');

      json.input.traits.email = email;
      json.input.traits.offerextractdate = new Date();

      test
        .identify(json.input)
        .set(settings)
        .request(2)
        .expects(204)
        .end(done);
    });

    it('should error on invalid creds', function(done){
      test
        .set({ apiKey: 'x' })
        .identify({})
        .error('Unauthorized', done);
    });
  });

  describe('._createOrUpdate()', function(){
    var email = fmt('test-%s@segment.io', uid());
    var properties = [{ property: 'email', value: email }];

    it('should be able to ._createOrUpdate() once', function (done) {
      hubspot._createOrUpdate(email, properties, done);
    });

    var properties = [
      { property: 'email', value: email },
      { property: 'lifecyclestage', value: 'lead' }
    ];

    it('should be able to ._createOrUpdate() on the second call', function (done) {
      hubspot._createOrUpdate(email, properties, done);
    });
  });

  describe('.track()', function(){
    it('should track successfully', function (done) {
      var msg = helpers.track();

      payload._a = String(settings.portalId);
      payload._n = msg.event();
      payload._m = String(msg.revenue());
      payload.age = String(msg.traits().age);
      payload.address = JSON.stringify(msg.proxy('properties.address'));
      payload.email = msg.email();
      payload.id = msg.traits().id;

      test
        .set(settings)
        .track(msg)
        .request(1)
        .query(payload)
        .expects(200)
        .end(done);
    });
  });
});
