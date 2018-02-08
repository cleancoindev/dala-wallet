const Web3 = require('web3');
const ProviderEngine = require('web3-provider-engine');
const WalletSubprovider = require('web3-provider-engine/subproviders/wallet.js');
const Web3Subprovider = require('web3-provider-engine/subproviders/web3.js');
const FilterSubprovider = require('web3-provider-engine/subproviders/filters.js');
const HookedWalletEthTxSubprovider = require('web3-provider-engine/subproviders/hooked-wallet-ethtx.js');
const RpcSubprovider = require('web3-provider-engine/subproviders/rpc.js');
const EthTx = require('ethereumjs-tx');
const ethUtil = require('ethereumjs-util');
var BigNumber = require("bignumber.js");

const secret = require('../secret');
const RPC_SERVER = secret.rpcServer;
const PRIVATE_KEY = secret.microraiden.privateKey;

const engine = new ProviderEngine();
engine.addProvider(new FilterSubprovider());
engine.addProvider(new HookedWalletEthTxSubprovider({
    getAccounts: (cb) => {
        return cb(null, [secret.microraiden.sender]);
    },
    getPrivateKey: (address, cb) => {
        cb(null, new Buffer(PRIVATE_KEY, 'hex'));
    }
}));
engine.addProvider(new Web3Subprovider(new Web3.providers.HttpProvider(RPC_SERVER)));

engine.on('error', (error) => console.log('error', error));
engine.start();

const MicroRaiden = require('@raiden_network/microraiden').MicroRaiden;
const web3 = new Web3(engine);


const uraiden = new MicroRaiden(web3, 
    secret.microraiden.contractAddress,
    secret.microraiden.contractAbi, 
    secret.microraiden.tokenAddress,
    secret.microraiden.tokenAbi
);
const request = require('request');

uraiden.loadChannelFromBlockchain(secret.microraiden.sender, secret.microraiden.receiver).then(channel => {
    if (uraiden.isChannelValid(channel)) {
        next(channel);
    } else {
        uraiden.openChannel(secret.microraiden.sender, secret.microraiden.receiver, 100).then(channel=>{
            next(channel);
        }).catch(console.log);
    }

    function next(channel){
        request('http://localhost:5000/api/1/stats', { json: true }, (error, response, body) => {
            uraiden.signNewProof({ balance: new BigNumber(body.balance_sum) }).then(proof => {
                uraiden.confirmPayment(proof);
                doRequest(channel, proof);
            }).catch(console.log);
        });
    }
}).catch(console.log);

function doRequest(channel, proof, headers) {
    request('http://localhost:5000/teapot', { headers }, (error, response, body) => {
        if (response.statusCode == 402) {
            console.log('payment required');
            uraiden.incrementBalanceAndSign(response.headers['rdn-price']).then(proof => {
                uraiden.confirmPayment(proof);

                var headers = {
                    'RDN-Contract-Address': secret.microraiden.contractAddress,
                    'RDN-Receiver-Address': secret.microraiden.receiver,
                    'RDN-Sender-Address': secret.microraiden.sender,
                    'RDN-Balance-Signature': proof.sig,
                    'RDN-Open-Block': channel.block.toString(),
                    'RDN-Balance': proof.balance.toString(),
                    'RDN-Sender-Balance': proof.balance.toString(),
                    'RDN-Price': response.headers['rdn-price']
                };
                doRequest(channel, proof, headers);
            }).catch(error => {
                console.log(error);
            })
        } else {
            console.log(response.statusCode);
            console.log(response.statusMessage);
            console.log(body);
        }
    });
}