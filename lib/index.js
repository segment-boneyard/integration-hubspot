
/**
 * Module dependencies.
 */

var integration = require('segmentio-integration');
var traverse = require('isodate-traverse');
var floor = require('date-math').day.floor;
var convert = require('convert-dates');
var isostring = require('isostring');
var fmt = require('util').format;
var Cache = require('lru-cache');
var mapper = require('./mapper');
var extend = require('extend');
var ms = require('ms');
var is = require('is');

/**
 * Expose `HubSpot`
 */

var HubSpot = module.exports = integration('HubSpot')
  .ensure('settings.portalId')
  .ensure('settings.apiKey')
  .ensure('message.email')
  .channels(['server'])
  .retries(2);

/**
 * Initialize.
 *
 * @api private
 */

HubSpot.prototype.initialize = function(){
  this.trackUrl = 'https://track.hubspot.com/v1';
  this.contactUrl = 'https://api.hubapi.com/contacts/v1';
  this.propertiesCache = new Cache({
    maxAge: ms('1h'),
    max: 500
  }); // cache properties by api key
};

/**
 * Records a HubSpot event, this is only enabled for enterprise customers.
 * https://developers.hubspot.com/docs/methods/enterprise_events/http_api
 *
 * Check here: https://app.hubspot.com/analyze/{{ portalId }}/events/
 *
 * @param {Track} track
 * @param {Function} callback
 * @api public
 */

HubSpot.prototype.track = function(track, callback){
  var payload = mapper.track(track, this.settings);
  var traits = convertDates(track.traits());
  var self = this;

  // Also add user traits to HubSpot track requests for backwards compat
  // and to mimic their js library
  this._filterProperties(traits, function(err, traits){
    if (err) return callback(err);

    traits.forEach(function(trait){
      payload[trait.property] = trait.value;
    });

    self
      .get(self.trackUrl + '/event')
      .query(payload)
      .end(self.handle(callback));
  });
};

/**
 * Identify a user by creating or updating their account in HubSpot, filtering
 * out traits which are not created in the HubSpot interface.
 *
 * https://developers.hubspot.com/docs/methods/contacts/update_contact
 * https://developers.hubspot.com/docs/methods/contacts/create_contact
 *
 * See your settings page for the list of properties:
 * https://app.hubspot.com/contacts/{{your portal id}}/settings/
 *
 * @param {Identify} identify
 * @param {Function} callback
 * @api public
 */

HubSpot.prototype.identify = function(identify, callback){
  var payload = mapper.identify(identify, this.settings);
  var self = this;

  // filter for existing properties
  this._filterProperties(payload, function(err, properties){
    if (err) return callback(err);

    self._getByEmail(identify.email(), function(err, user){
      if (err) return callback(err);
      if (user) return self._update(user.vid, properties, callback);
      self._create(properties, callback);
    });
  });
};

/**
 * Updates a contact in HubSpot with the hubspot style `properties`
 *
 * @param {String} vid
 * @param {Array} properties
 * @param {Function} callback  (err)
 * @api private
 */

HubSpot.prototype._update = function(vid, properties, callback){
  this
    .post(fmt('%s/contact/vid/%s/profile', this.contactUrl, vid))
    .query({ hapikey: this.settings.apiKey })
    .type('json')
    .send({ properties: properties })
    .end(this.handle(callback));
};

/**
 * Create a new contact in HubSpot. If the contact exists, try and update it
 * instead.
 *
 * @param {Object} properties
 * @param {Function} callback  (err)
 * @api private
 */

HubSpot.prototype._create = function(properties, callback){
  var self = this;

  this
  .post(this.contactUrl + '/contact')
  .type('json')
  .query({ hapikey: this.settings.apiKey })
  .send({ properties: properties })
  .end(function(err, res){
    if (err) return callback(err);
    var body = res.body;

    // If we receive anything other than a 409, return the request normally.
    if (res.statusCode !== 409) {
      return self.handle(callback).apply(self, arguments);
    }

    // If we receive a 409, decide to update. That means that the requests
    // were interleaved and the contact exists.
    try {
      body = JSON.parse(body.message);
      var vid = body.property.vid;
      self.debug('contact with email %s already exists as %s', properties.email, vid);
      self._update(vid, properties, callback);
    } catch (err) {
      callback(err);
    }
  });
};

/**
 * Gets a user by their email.
 *
 * @param {String} email
 * @param {Function} callback  (err, user)
 */

HubSpot.prototype._getByEmail = function(email,callback){
  var self = this;
  this
  .get(fmt('%s/contact/email/%s/profile', this.contactUrl, email))
  .set('Accept', 'application/json')
  .query({ hapikey: this.settings.apiKey })
  .end(function(err, res){
    if (err) return callback(err);
    var body = res.body;

    if (res.statusCode === 404) {
      self.debug('user %s did not exist', email);
      return callback();
    }

    if (res.statusCode === 200) {
      self.debug('user %s found successfully', email);
      return callback(null, body);
    }

    self.debug('received a bad hubspot status %s', res.statusCode);
    callback(self.error('error status=%s', res.statusCode));
  });
};

/**
 * Filter the new properties for only ones which already exist
 *
 * Returns them as an array in the form that HubSpot expects.
 *
 * @param {Object} properties
 * @param {Function} callback  (err, properties) a properties array
 */

HubSpot.prototype._filterProperties = function(properties, callback){
  var self = this;
  this._getProperties(function(err, existingProperties){
    if (err) return callback(err);

    var filteredProperties = [];
    // hubspot passes all keys back as lowercase w/ underscores
    properties = snakecase(properties);
    existingProperties.forEach(function(property){
      if (!properties.hasOwnProperty(property.name)) return;

      var value = properties[property.name];
      if (isostring(value)) value = new Date(value);
      if (is.date(value) && property.type === 'date') value = floor(value);
      if (is.date(value)) value = value.getTime();
      if (is.object(value) || is.array(value)) value = JSON.stringify(value);
      if (is.boolean(value)) value = value.toString();
      if (value && property.type === 'string') value = value.toString();

      self.debug('including property %s: %s', property.name, value);
      filteredProperties.push({
        property: property.name,
        value: value
      });
    });

    self.debug('filtered properties');
    return callback(null, filteredProperties);
  });
};

/**
 * Gets the properties from the cache or from the HubSpot API
 */

HubSpot.prototype._getProperties = function(callback){
  var apiKey     = this.settings.apiKey
  var properties = this.propertiesCache.peek(apiKey);
  var self = this;

  if (properties) {
    this.debug('found properties in cache');
    return process.nextTick(function(){
      callback(null, properties);
    });
  }

  this
  .get(this.contactUrl + '/properties')
  .query({ hapikey: apiKey })
  .set('Accept', 'application/json')
  .end(this.handle(function(err, res){
    if (err) return callback(err);
    var body = res.body;

    properties = body.filter(function(property){
      return !property.readOnlyValue;
    });

    self.debug('retrieved properties from server');
    self.propertiesCache.set(apiKey, properties);
    return callback(null, properties);
  }));
};

/**
 * Snake case the keys of the object
 */

function snakecase(object){
  var output = {};
  Object.keys(object).forEach(function(key){
    output[key.toLowerCase().replace(/\s+/g, '_')] = object[key];
  });
  return output;
}

/**
 * Hubspot requests that any dates be millisecond timestamps.
 */

function convertDates(object){
  object = traverse(object);
  return convert(object, function(date){ return date.getTime(); });
}
