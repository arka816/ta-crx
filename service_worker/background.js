let rule = {
    conditions: [
        new chrome.declarativeContent.PageStateMatcher({
            pageUrl: {urlMatches: 'https://www.tripadvisor.in/*'}
        }),
        new chrome.declarativeContent.PageStateMatcher({
            pageUrl: {urlMatches: 'https://www.tripadvisor.com/*'}
        })
    ],
    actions: [new chrome.declarativeContent.ShowAction()]
};

chrome.runtime.onInstalled.addListener((details) => {
    // Page actions are disabled by default and enabled on select tabs
    chrome.action.disable();

    // rule checks for conditions and shows action if met
    chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
        chrome.declarativeContent.onPageChanged.addRules([rule]);
    });
}); 


/************* websocket for communication with python server ************/
const port = 4567;
const serverUrl = `ws://localhost:${port}`;
var webSocket = null;

function disconnect() {
    if (webSocket == null) {
        return;
    }
    webSocket.close(1000);
}

async function serverJobFinished(message){
    var response = await chrome.storage.local.get('state');
    var state = JSON.parse(response.state);

    state.status = {
        code: 'COMPLETE',
        message: message
    };
    state.output = [];

    chrome.storage.local.set({'state': JSON.stringify(state)});
}

function keepAlive() {
    const keepAliveIntervalId = setInterval(
        function(){
            if (webSocket) {
                webSocket.send(JSON.stringify({'type': 'KEEPALIVE'}));
            }
            else {
                clearInterval(keepAliveIntervalId);
            }
        },
        20 * 1000 
    );
}

function socketError(callback){
    console.log('web socket error. falling back to raw download.')

    callback({
        type: 'ERROR',
        message: 'web socket error'
    });
}

function handleDownload(serverPayload, callback) {
    try{
        webSocket = new WebSocket(serverUrl);
    }
    catch(e){
        socketError(callback);
    }

    webSocket.onerror = (event) => {
        socketError(callback);
    }

    webSocket.onopen = (event) => {
        console.log('websocket open');

        serverPayload = {
            ...serverPayload,
            'type': 'INIT'
        }
        webSocket.send(JSON.stringify(serverPayload));

        keepAlive();
    };

    webSocket.onmessage = (event) => {
        let message = JSON.parse(event.data);

        console.log('websocket received message:', message);

        if (message.type == 'ACK'){
            callback(message);            
        }
        else if (message.type == 'COMPLETE'){
            serverJobFinished(message.message);
            disconnect();
        }
    };

    webSocket.onclose = (event) => {
        console.log('websocket connection closed');
        webSocket = null;
    };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action == 'download') {
        // send json object to python server for processing
        var searchInputs = request.inputs;
        var scraperOutput = request.output;
        
        // connect to websocket
        var serverPayload = {
            inputs: searchInputs,
            output: scraperOutput
        };
        handleDownload(serverPayload, sendResponse);
    }
    return true;
})
