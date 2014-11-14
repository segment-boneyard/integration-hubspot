
/**
 * Module dependencies.
 */

var traverse = require('isodate-traverse');
var del = require('obj-case').del;
var extend = require('extend');

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
  var payload = traverse(msg.traits());

  payload = extend(payload, {
    jobtitle: msg.position(),
    city: msg.city(),
    zip: msg.zip(),
    firstname: msg.firstName(),
    lastname: msg.lastName(),
    address: msg.address(),
    email: msg.email(),
    phone: msg.phone()
  });

  // remove .position, .postalCode
  del(payload, 'position');

  if (msg.created()) {
    payload.createdate = msg.created().getTime();
  }

  return payload;
};
