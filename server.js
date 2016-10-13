/**
 * This file provided by Facebook is for non-commercial testing and evaluation
 * purposes only. Facebook reserves all rights not expressly granted.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
 * FACEBOOK BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
 * ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

var express = require('express');
var path = require('path');
var bodyParser = require('body-parser');
var geocoder = require('geocoder');
var request = require('request');
var tj = require('togeojson'),
    fs = require('fs'),
    jsdom = require('jsdom').jsdom;
var inside = require('point-in-polygon');
var xlsx = require('xlsx');
var app = express();

var COMMENTS_FILE = path.join(__dirname, 'comments.json');

app.set('port', (process.env.PORT || 3000));

app.use('/', express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

// Additional middleware which will set headers that we need on each request.
app.use(function(req, res, next) {
    // Set permissive CORS header - this allows this server to be used only as
    // an API server in conjunction with something like webpack-dev-server.
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Disable caching so we'll always get the latest comments.
    res.setHeader('Cache-Control', 'no-cache');
    next();
});

app.get('/api', function(req, res) {
  
    /* User input string that will be attempted to locate */
    var inputAddress = req.query.address;
    
    /* Number of different modules that should be requested */
    var expectedNum = 5; //can be dynamic or defined by hand
    
    /* Results of those requests go in this array */
    var modules = [];

    /* Helper function that returns the request only after all modules are attempted, can be refactored elsewhere */
    function addModule(newModule){
        modules.push(newModule);
        tryResponse();
    }
    
    function tryResponse(){
        if(modules.length == expectedNum){
            /*** RESPONSE ***/
            res.send(modules);
        }
    }
    
    /* Helper for iterating Excel columns */
    function colName(n) {
        var ordA = 'a'.charCodeAt(0);
        var ordZ = 'z'.charCodeAt(0);
        var len = ordZ - ordA + 1;
      
        var s = "";
        while(n >= 0) {
            s = String.fromCharCode(n % len + ordA) + s;
            n = Math.floor(n / len) - 1;
        }
        return s;
    }
    
    /* Helper for title case */
    function toTitleCase(str){
        return str.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});
    }
    
    /* Helper to cherrypick object properties (from the Excel file mostly) */
    function pruneObject(everything, desired){
        var result = {};
        for(var key in everything){
            if(desired.indexOf(key) != -1){
                result[key] = everything[key];
            }
        }
        return result;
    }


    /* ROOT REQUEST: Get location */
    /* Documentation of the location object (variable name data): */
    /* https://developers.google.com/maps/documentation/javascript/geocoding#GeocodingResponses */
    geocoder.geocode(inputAddress, function ( err, data ) {
        
        /* In addition to whatever Google knows, the coordinate pair must be mapped to a "Peruspiiri" */
        var perusPiiri;
        var perusPiiriKml = jsdom(fs.readFileSync('datasets/peruspiiri.kml', 'utf8')); //Peruspiiri boundary file
        var perusPiiriJson = tj.kml(perusPiiriKml);
        
        /* For each peruspiiri */
        for(var feature in perusPiiriJson.features){
            var polygon = perusPiiriJson.features[feature].geometry.coordinates[0];
            
            if( inside([data.results[0].geometry.location.lng, data.results[0].geometry.location.lat, 0], polygon) ){

                /* Peruspiiri object */
                perusPiiri = perusPiiriJson.features[feature];
                //console.log(perusPiiri);
                break; //comment this out if it turns out a location can have several matches
                
            }
        }
        

        /*** MODULE CALLS ***/
        //each different because the APIs are different
        //but each end up sticking uniform objects through addModule()
        
        /* 1: INTRO */
        var titleArr = [];
        for(var idx in data.results[0].address_components){
            var component = data.results[0].address_components[idx].long_name;
            if(titleArr.indexOf(component) == -1){
                titleArr.push(component);
            }
        }
        var titleStr = titleArr.join(" / ");
        var descrStr = "";
            descrStr = typeof perusPiiri != "undefined" ? titleStr + " is located in " + toTitleCase(perusPiiri.properties.NIMI) : "Couldn't map "+titleStr+" to any Helsinki neighborhood. Maybe it's not in Helsinki?";
        
        var introModule = {
            title: titleStr,
            type: "text",
            data: descrStr
        }
        addModule(introModule);

        /* 2: SERVICES */
        request('http://www.hel.fi/palvelukarttaws/rest/v2/unit/?lat='+(data.results[0].geometry.location.lat).toFixed(5)+'&lon='+(data.results[0].geometry.location.lng).toFixed(5)+'&distance=800', function (error, response, body) {
            if (!error && response.statusCode == 200 && JSON.parse(body).length) {
                
                /* This part should always be always similar because these objects go to UI */
                var serviceModule = {
                    title: "Services in the area",
                    type: "map",
                    data: JSON.parse(body)
                }
                addModule( serviceModule );

            }else{
                expectedNum = expectedNum - 1; /* 2 out of all modules fail on this check */
                tryResponse();
            }
        })



        /* 3: DEMOGRAPHICS */

        var demographicsByRegion = xlsx.readFile("datasets/Helsinki_alueittain_2015.xlsx");
        var rowNum;
        var demographicsObj = {};
        if(typeof perusPiiri != "undefined"){
            for(var i = 6; i <= 47; i++){ //find row number for Peruspiiri
                if(demographicsByRegion.Sheets.Taulukko["A"+i].v.substring(0,3) == perusPiiri.properties.TUNNUS){
                    rowNum = i;
                    break;
                }
            }
            /* loop cols */
            for(var i = 2; i <= 131; i++){
                // demographicsObj[ KEY ] = VALUE;
                // KEY at row 3, VALUE at the rowNum figured above
                // as thus: colName(i).toUpperCase()+rowNum
                demographicsObj[ demographicsByRegion.Sheets.Taulukko[ colName(i).toUpperCase() + "3" ].v ] = demographicsByRegion.Sheets.Taulukko[ colName(i).toUpperCase() + rowNum ].v;
            }
            
            var demographicsModule = {
                title: "Big mess of demographics",
                type: "mess",
                data: demographicsObj
            }
            addModule( demographicsModule );
            
            
            var ageDemographicsModule = {
                title: "Age demographics",
                type: "pie",
                data: pruneObject(demographicsObj, [
                        "0-6-vuotiaat",
                        "7-15-vuotiaat",
                        "16-18-vuotiaat",
                        "19-24-vuotiaat",
                        "25-39-vuotiaat",
                        "40-64-vuotiaat",
                        "Yli 65-vuotiaat"
                      ])
            }
            addModule( ageDemographicsModule );
            
            
        }else{
            
            /* Upon failure, lower expectations */
            expectedNum = expectedNum - 2; /* 2 out of all modules fail on this check */
            tryResponse();
            
        }
        
        /* 4: PICS */
        var panoramioRectangleRadius = 0.01; /* 0.05 lat/lng = about 6km */
        request('http://www.panoramio.com/map/get_panoramas.php?set=public&from=0&to=10'
               +'&minx=' + (data.results[0].geometry.location.lng - panoramioRectangleRadius)
               +'&miny=' + (data.results[0].geometry.location.lat - panoramioRectangleRadius)
               +'&maxx=' + (data.results[0].geometry.location.lng + panoramioRectangleRadius)
               +'&maxy=' + (data.results[0].geometry.location.lat + panoramioRectangleRadius)
               +'&size=medium&mapfilter=true',
            function (error, response, body) {
                
            if (!error && response.statusCode == 200) {
                
                /* This part should always be always similar because these objects go to UI */
                var picModule = {
                    title: "Pictures from the area",
                    type: "pics",
                    data: JSON.parse(body)
                }
                addModule( picModule );

            }else{
                console.log(error);
                
                expectedNum--;
                tryResponse();
            }
        })

        
        
    });
});


app.listen(app.get('port'), function() {
  console.log('Server started: http://localhost:' + app.get('port') + '/');
});
