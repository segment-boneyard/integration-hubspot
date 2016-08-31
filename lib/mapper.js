
/**
 * Module dependencies.
 */

var traverse = require('isodate-traverse');
var del = require('obj-case').del;
var extend = require('extend');
var reject = require('reject');
var each = require('@ndhoule/each');

/**
 * Map track `msg`.
 *
 * Notes:
 *
 *    https://developers.hubspot.com/docs/methods/enterprise_events/http_api
 *    https://app.hubspot.com/analyze/{{ portalId }}/events/
 *
 * @param {Facade} msg
 * @param {Object} settings
 * @return {Object}
 */

exports.track = function(msg, settings){
  return {
    _a: settings.portalId,
    email: msg.email(),
    _m: msg.revenue(),
    _n: msg.event(),
  };
};

/**
 * Map identify `msg`.
 *
 * Notes:
 *
 *    https://developers.hubspot.com/docs/methods/contacts/update_contact
 *    https://developers.hubspot.com/docs/methods/contacts/create_contact
 *    https://groups.google.com/forum/#!searchin/hubspot-api/datetime/hubspot-api/azXRWXWWLVc/oiSmkT2Y_DcJ
 *
 * TODO:
 *
 *    spec .jobTitle
 *    .city() == .traits.city || traits.address.city
 *    .zip() == .traits.zip || traits.address.zip
 *
 * @param {Facade} msg
 * @return {Object}
 */

exports.identify = function(msg){
  var payload = traverse(formatTraits(msg.traits()));

  payload = reject(extend(payload, {
    jobtitle: msg.position(),
    city: msg.city(),
    zip: msg.zip(),
    email: msg.email(),
    firstname: msg.firstName(),
    lastname: msg.lastName(),
    address: msg.address(),
    phone: msg.phone()
  }));

  // remove .position, .postalCode
  del(payload, 'position');

  if (msg.created()) {
    payload.createdate = msg.created().getTime();
  }

  return payload;
};

/**
 * lowercase & snakecase any trait with uppercase letters or spaces
 * Hubspot cannot accept uppercases or spaces
 *
 * @api private
 * @param {Object} traits
 * @return {Object} ret
 */

function formatTraits(traits) {
  var ret = {};
  each(function(value, key) {
    var k = key.toLowerCase().replace(/\s/g,'_');
    ret[k] = value;
  }, traits);

  return ret;
}
