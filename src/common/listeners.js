'use strict';

const { EventTypes } = require('./constants');
const StreamUtils = require('../lib/StreamUtils');

module.exports.onDalaWalletEvent = (event, context, callback) => {
    return StreamUtils.startStateMachinePerItem(event, {
        [EventTypes.CreateWallet]: {
            stateMachineArn: process.env.ON_CREATE_WALLET_STATE_MACHINE
        },
        [EventTypes.CreateSubscriber]: {
            stateMachineArn: process.env.ON_CREATE_SUBSCRIBER_STATE_MACHINE
        }
    }).then(() => context.succeed(event)).catch(contex.fail);
};