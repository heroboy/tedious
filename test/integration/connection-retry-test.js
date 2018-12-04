const Connection = require('../../src/tedious').Connection;
const fs = require('fs');
const sinon = require('sinon');
const TransientErrorLookup = require('../../src/transient-error-lookup').TransientErrorLookup;

const getConfig = function() {
  const config = JSON.parse(fs.readFileSync(require('os').homedir() + '/.tedious/test-connection.json', 'utf8')).config;
  if (config.authentication) {
    config.authentication.options.password = 'InvalidPassword';
  } else {
    config.password = 'InvalidPassword';
  }
  config.options.maxRetriesOnTransientErrors = 5;
  config.options.connectionRetryInterval = 25;

  return config;
};

exports['connection retry tests'] = {
  setUp: function(done) {
    this.invalidLoginError = 18456;
    done();
  },

  tearDown: function(done) {
    sinon.restore();
    done();
  },

  'retry specified number of times on transient errors': function(test) {
    const config = getConfig();

    if (config.authentication && config.authentication.type === 'azure-active-directory-password') {
      return test.done();
    }

    test.expect(config.options.maxRetriesOnTransientErrors + 1);

    sinon.stub(TransientErrorLookup.prototype, 'isTransientError').callsFake((error) => {
      return error === this.invalidLoginError;
    });

    const connection = new Connection(config);

    connection.on('retry', () => {
      test.ok(true);
    });

    connection.on('connect', (err) => {
      test.ok(err);
    });

    connection.on('end', (info) => {
      test.done();
    });
  },

  'no retries on non-transient errors': function(test) {
    const config = getConfig();

    if (config.authentication && config.authentication.type === 'azure-active-directory-password') {
      return test.done();
    }

    test.expect(1);

    sinon.stub(TransientErrorLookup.prototype, 'isTransientError').callsFake((error) => {
      return error !== this.invalidLoginError;
    });

    const connection = new Connection(config);

    connection.on('retry', () => {
      test.ok(false);
    });

    connection.on('connect', (err) => {
      test.ok(err);
    });

    connection.on('end', (info) => {
      test.done();
    });
  },

  'no retries if connection timeout fires': function(test) {
    const config = getConfig();

    if (config.authentication && config.authentication.type === 'azure-active-directory-password') {
      return test.done();
    }

    config.options.connectTimeout = config.options.connectionRetryInterval / 2;

    const clock = sinon.useFakeTimers({ toFake: [ 'setTimeout' ] });

    test.expect(1);

    sinon.stub(TransientErrorLookup.prototype, 'isTransientError').callsFake((error) => {
      return error === this.invalidLoginError;
    });

    const connection = new Connection(config);

    connection.on('retry', () => {
      test.ok(false);
    });

    connection.on('errorMessage', () => {
      // Forward clock past connectTimeout which is less than retry interval.
      clock.tick(config.options.connectTimeout + 1);
    });

    connection.on('connect', (err) => {
      test.ok(err);
    });

    connection.on('end', (info) => {
      clock.restore();
      test.done();
    });
  },
};
