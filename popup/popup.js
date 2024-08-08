const DEFAULT_MAX_PLACES = 1;   // TODO: change these later
const DEFAULT_MAX_REVIEWS = 10;

const kwInputElem = document.getElementById("keywordElem");
const maxPlacesElem = document.getElementById("maxPlacesElem");
const maxReviewsElem = document.getElementById("maxReviewsElem");
const saveImagesElem = document.getElementById("saveImagesElem");
const kwInputBtn = document.getElementById("searchBtnElem");
const resetBtn = document.getElementById('resetBtnElem');
const statusElem = document.getElementById("statusElem");

var active = true;

function setStatus(status){
    statusElem.innerHTML = status;
}

function checkStatus(tabId){
    chrome.storage.local.get({tabId: null}).then((result) => {
        if (result[tabId] !== null) {
            var state = JSON.parse(result[tabId]);

            let {code, message} = state.status;
    
            active = (code == 'COMPLETE');
            kwInputBtn.disabled = !active;
    
            setStatus(message);
        }
    });
}

function loadUI(tabId){
    chrome.storage.local.get({tabId: null}).then((result) => {
        if (result[tabId] !== null) {
            var state = JSON.parse(result[tabId]);

            let {keyword, maxPlaces, maxReviews, saveImages} = state.inputs;

            kwInputElem.value = keyword ?? '';
            maxPlacesElem.value = maxPlaces ?? '';
            maxReviewsElem.value = maxReviews ?? '';
            saveImagesElem.checked = saveImages ?? false;
        }
    });
}

async function getTabId(){
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    return tab.id;
}

window.onload = async function(){
    const tabId = await getTabId();

    checkStatus();
    loadUI();

    chrome.storage.onChanged.addListener(function(changes, namespace) {
        checkStatus();
    });
    
    kwInputBtn.addEventListener("click", async (e) => {
        await chrome.storage.local.remove(tabId);

        var keyword = kwInputElem.value;
        var maxPlaces = parseInt(maxPlacesElem.value) || DEFAULT_MAX_PLACES;
        var maxReviews = parseInt(maxReviewsElem.value) || DEFAULT_MAX_REVIEWS;
        var saveImages = saveImagesElem.checked;
    
        sendInputs(tabId, keyword, maxPlaces, maxReviews, saveImages);
    });

    resetBtn.addEventListener("click", async () => {
        await chrome.storage.local.remove(tabId);
        setStatus('reset state');
    })
}



async function sendInputs(tabId, keyword, maxPlaces=1, maxReviews=10, saveImages=true){
    // send inputs to content script for it to execute
    // NOTE: actionId must be 1

    try{
        let response = await chrome.tabs.sendMessage(
            tabId, 
            {
                actionId: 1,
                inputs: {
                    keyword: keyword,
                    maxPlaces: maxPlaces,
                    maxReviews: maxReviews,
                    saveImages: saveImages
                }
            }
        );
        if (response['type'] == 'ACK'){
            setStatus("searching...");
            kwInputBtn.disabled = true;
        }
        else if (response['type'] == 'error'){
            setStatus(response['message'])
        }
        else setStatus("failed to send keyword");
    }      
    catch(ex){
        console.error(ex);
        setStatus("failed to send keyword. see console.");
    }   
}
