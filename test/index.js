
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
      .channels(['server'])
      .retries(2);
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
      it('should map basic identify', function(){
        test.maps('identify-basic');
      });

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
    });
  });

  describe('.identify()', function(){
    it('should identify successfully', function (done) {
      var msg = helpers.identify();

      payload.properties = [
        { property: 'company', value: 'Segment.io' },
        { property: 'last_name', value: 'Doe' },
        { property: 'firstname', value: 'John' },
        { property: 'lastname', value: 'Doe' },
        { property: 'email', value: msg.email() },
        { property: 'phone', value: '5555555555' },
        { property: 'city', value: 'San Francisco' },
        { property: 'state', value: 'CA' }
      ];

      test
        .set(settings)
        .identify(msg)
        .request(2)
        .sends(payload)
        .expects(200)
        .end(done);
    });

    it('should identify a second time', function (done) {
      test
        .identify(helpers.identify())
        .set(settings)
        .request(2)
        .expects(204)
        .end(done);
    });

    it('should identify with "date" objects', function (done) {
      // the hubspot demo key has this as the only "date" type
      var msg = helpers.identify({
        traits: {
          offerextractdate: new Date()
        }
      });

      payload.properties = [
        { property: 'company', value: 'Segment.io' },
        { property: 'last_name', value: 'Doe' },
        { property: 'firstname', value: 'John' },
        { property: 'lastname', value: 'Doe' },
        { property: 'email', value: msg.email() },
        { property: 'phone', value: '5555555555' },
        { property: 'city', value: 'San Francisco' },
        { property: 'state', value: 'CA' }
      ];

      test
        .identify(msg)
        .set(settings)
        .request(2)
        .sends(payload)
        .expects(204)
        .end(done);
    });

    it('should error on invalid creds', function(done){
      test
        .set({ apiKey: 'x' })
        .identify({})
        .error('cannot GET /contacts/v1/properties?hapikey=x (401)', done);
    });
  });

  describe('._create()', function(){
    var email = fmt('test-%s@segment.io', uid());
    var properties = [{ property: 'email', value: email }];

    it('should be able to ._create() once', function (done) {
      hubspot._create(properties, done);
    });

    it('should be able to ._update() on the second call', function (done) {
      hubspot._create(properties, done);
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
