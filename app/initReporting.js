/* initReporting.js
 * The following file is referenced within the client side views
 * Contains AJAX calls necessary to communicate with server-side script 
 * to retrieve reports and add them to the markup. Code for this file is 
 * used from the sample application OnTrack provided by IBM
 */

var urlRoot = "/ers/v1/";
var xRunLocation = "";

/* load report styles css asynchronously */
(function(){
	var lnk = document.createElement("link");
	lnk.rel='stylesheet';
	lnk.type='text/css'; 
	lnk.href = urlRoot + '~/schemas/GlobalReportStyles_10.css';
	var h = document.getElementsByTagName("head");
	h[0].appendChild(lnk);
})();

// Delete any runinstances that may be open when closing the browser
window.onbeforeunload = function () {
	return deleteRunInstance();
};


function getXmlHttp() {
	if (window.XMLHttpRequest) {
		return new XMLHttpRequest();
	} else {
		return new ActiveXObject("Microsoft.XMLHTTP");
	}
}

function getReport(reportID, elementID, format) {
	
	// if runLocation non-empty, release it.
	deleteRunInstance();

	// Locate placeholder for the report
	var reportElement = document.getElementById(elementID);

	// While we load, show busy.gif
	reportElement.innerHTML = "<span text-align:center'><img src='/img/busy.gif'/></span>";

	// Construct the URL to retrieve the report from the server
	var reportUrl = urlRoot + "definitions/" + reportID + "/reports/" + format;               
	var report = getXmlHttp();
	report.open("GET", reportUrl, true);

	report.onreadystatechange = function() {
		if (report.readyState === 4) {
			
			if(format === "json") {
				handleJsonResponse(report.responseText, reportElement);
			} else {
				handleHtmlResponse(report.responseText, reportElement);
			}
	
			if (report.status === 200) {
				// report ran successfully, we are now done with the run instance
				xRunLocation = report.getResponseHeader("X-RunLocation");
			}
		}
	};
	report.send();
}

function handleJsonResponse(text, element) {

	var data = JSON.parse(text);
	var item = data.dataset.rows[0];
	element.innerHTML = "<span style='font-size:24pt; color: #379ec4;'>&nbsp;" + item + " </span>";
}

function handleHtmlResponse(text, element) {
	element.innerHTML = text.replace(/\.\.\/\.\.\//g, urlRoot);
}

/**
* Always delete the run instance when you're "finished" with a report run.
* You are done if you don't need to run secondary requests on the instance,
* like "next page" or "run in PDF"
*/
function deleteRunInstance() {
	if (xRunLocation !== "") {
		var del = getXmlHttp();
		del.open("DELETE", xRunLocation, true);
		del.send();
		xRunLocation = "";
	}
}

function insertReports() {
	getReport("57f95b2b5d3cf8fecf7b3e09e882cee7", "insertReport", "phtml");
}