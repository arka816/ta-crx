const DEFAULT_MAX_PLACES = 1;   // TODO: change these later
const DEFAULT_MAX_REVIEWS = 10;

const kwInputElem = document.getElementById("keywordElem");
const maxPlacesElem = document.getElementById("maxPlacesElem");
const maxReviewsElem = document.getElementById("maxReviewsElem");
const saveImagesElem = document.getElementById("saveImagesElem");
const kwInputBtn = document.getElementById("searchBtnElem");
const statusElem = document.getElementById("statusElem");

var active = true;

function setStatus(status){
    statusElem.innerHTML = status;
}

function checkStatus(){
    chrome.storage.local.get({'state': null}).then(({state}) => {
        state = JSON.parse(state);

        if (state !== null) {
            let {code, message} = state.status;
    
            active = (code == 'COMPLETE');
            kwInputBtn.disabled = !active;
    
            setStatus(message);
        }
    });
}

function loadUI(){
    chrome.storage.local.get({'state': null}).then(({state}) => {
        state = JSON.parse(state);

        if (state !== null) {
            let {keyword, maxPlaces, maxReviews, saveImages} = state.inputs;

            kwInputElem.value = keyword ?? '';
            maxPlacesElem.value = maxPlaces ?? '';
            maxReviewsElem.value = maxReviews ?? '';
            saveImagesElem.checked = saveImages;
        }
    });
}

window.onload = function(){
    checkStatus();
    loadUI();

    chrome.storage.onChanged.addListener(function(changes, namespace) {
        checkStatus();
    });
    
    kwInputBtn.addEventListener("click", async (e) => {
        await chrome.storage.local.clear();

        var keyword = kwInputElem.value;
        var maxPlaces = parseInt(maxPlacesElem.value) || DEFAULT_MAX_PLACES;
        var maxReviews = parseInt(maxReviewsElem.value) || DEFAULT_MAX_REVIEWS;
        var saveImages = saveImagesElem.checked;
    
        sendInputs(keyword, maxPlaces, maxReviews, saveImages);
    });
}



async function sendInputs(keyword, maxPlaces=1, maxReviews=10, saveImages=true){
    // send inputs to content script for it to execute
    // NOTE: actionId must be 1
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});

    try{
        let response = await chrome.tabs.sendMessage(
            tab.id, 
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
