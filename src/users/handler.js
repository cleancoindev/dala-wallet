'use strict';

const { EventTypes } = require('../common/constants');
const DalaWalletEvent = require('../model/DalaWalletEvent');
const AWS = require('aws-sdk');
const cognitoIdentityServiceProvider = new AWS.CognitoIdentityServiceProvider();

module.exports.authenticate = (event, context, callback) => {
    const body = JSON.parse(event.body);
    const { username, password } = body;
    cognitoIdentityServiceProvider.adminInitiateAuth({
        AuthFlow: 'ADMIN_NO_SRP_AUTH',
        AuthParameters: {
            USERNAME: username,
            PASSWORD: password
        },
        ClientId: process.env.CLIENT_ID,
        UserPoolId: process.env.USER_POOL_ID
    }).promise().then(result => {
        console.log(result);
        return context.succeed({
            statusCode: 200,
            body: JSON.stringify(result.AuthenticationResult)
        });
    }).catch(error => {
        console.log(error);
        return context.fail(error);
    });
}

module.exports.register = (event, context, callback) => {
    const body = JSON.parse(event.body);
    const { username, password, phoneNumber, email, firstName, surname } = body;

    if (!firstName) return context.succeed({
        statusCode: 400,
        body: 'firstName is required'
    });
    if (!surname) return context.succeed({
        statusCode: 400,
        body: 'surname is required'
    });

    const createUserParams = {
        UserPoolId: process.env.USER_POOL_ID,
        Username: username,
        ForceAliasCreation: false,
        MessageAction: 'SUPPRESS',
        TemporaryPassword: password,
        UserAttributes: [
            {
                Name: 'given_name',
                Value: firstName
            },
            {
                Name: 'family_name',
                Value: surname
            }
        ]
    };
    if (email) {
        createUserParams.UserAttributes.push({
            Name: 'email',
            Value: email
        });
        createUserParams.UserAttributes.push({
            Name: 'email_verified',
            Value: 'true'
        });
    }
    if (phoneNumber) {
        createUserParams.UserAttributes.push({
            Name: 'phone_number',
            Value: phoneNumber
        });
        createUserParams.UserAttributes.push({
            Name: 'phone_number_verified',
            Value: 'true'
        });
    }

    cognitoIdentityServiceProvider.adminCreateUser(createUserParams).promise().then(data => {
        console.log('create user response', data);
        let authRequest = {
            AuthFlow: 'ADMIN_NO_SRP_AUTH',
            AuthParameters: {
                USERNAME: username,
                PASSWORD: password,
            },
            ClientId: process.env.CLIENT_ID,
            UserPoolId: process.env.USER_POOL_ID
        };
        return cognitoIdentityServiceProvider.adminInitiateAuth(authRequest).promise();
    }).then(data => {
        if (data.ChallengeName == 'NEW_PASSWORD_REQUIRED') {
            let challengeRequest = {
                ChallengeName: 'NEW_PASSWORD_REQUIRED',
                ChallengeResponses: {
                    USERNAME: data.ChallengeParameters.USER_ID_FOR_SRP || username,
                    NEW_PASSWORD: password,
                },
                Session: data.Session,
                ClientId: process.env.CLIENT_ID,
                UserPoolId: process.env.USER_POOL_ID
            };
            return cognitoIdentityServiceProvider.adminRespondToAuthChallenge(challengeRequest).promise();
        }
    }).then(data => {
        const walletEvent = new DalaWalletEvent(username, EventTypes.UserConfirmed, {
            username,
            firstName,
            surname,
            phoneNumber,
            email
        }, context);
        return walletEvent.save().then(() => {
            return context.succeed({
                statusCode: 200,
                body: JSON.stringify(data.AuthenticationResult)
            });
        });
    }).catch(context.fail);
}

