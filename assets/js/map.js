const MapBase = {
    minZoom: 4,
    maxZoom: 7,
    map: null,
    overlays: [],
    isDarkMode: false,
    updateLoopAvailable: true,
    updateTippyTimer: null,
    requestLoopCancel: false,
    showAllMarkers: false,
    filtersData: [],
    index: 0,

    // Query adjustable parameters
    isPreviewMode: false,
    colorOverride: null,
    themeOverride: null,
    viewportX: -24,
    viewportY: 24,
    viewportZoom: 4,

    init: function () {
        'use strict';

        // Parses and properly sets map preferences from query parameters.
        this.beforeLoad();

        this.tippyInstances = [];
        const mapBoundary = L.latLngBounds(L.latLng(-48, 0), L.latLng(0, 48));
        var path = window.location.pathname;
        var page = path.split("/").pop().split(".").shift();
        //Please, do not use the GitHub map tiles. Thanks
        const mapLayers = {
            'map.layers.default': L.tileLayer('./assets/maps/' + page + '/{z}/{x}_{y}.png', {
                noWrap: true,
                bounds: mapBoundary,
                attribution: '<a href="https://www.aiononline.com/en-us" target="_blank">NcSoft</a>',
            })
        };

        // Override bindPopup to include mouseover and mouseout logic.
        L.Layer.include({
            bindPopup: function (content, options) {

                // TODO: Check if we can move this from here.
                if (content instanceof L.Popup) {
                    L.Util.setOptions(content, options);
                    this._popup = content;
                    content._source = this;
                } else {
                    if (!this._popup || options) {
                        this._popup = new L.Popup(options, this);
                    }
                    this._popup.setContent(content);
                }

                if (!this._popupHandlersAdded) {
                    this.on({
                        click: this._openPopup,
                        keypress: this._onKeyPress,
                        remove: this.closePopup,
                        move: this._movePopup,
                    });
                    this._popupHandlersAdded = true;
                }

                this.on('mouseover', function (e) {
                    if (!Settings.isPopupsHoverEnabled) return;
                    this.openPopup();
                });

                this.on('mouseout', function (e) {
                    if (!Settings.isPopupsHoverEnabled) return;

                    const that = this;
                    const timeout = setTimeout(function () {
                        that.closePopup();
                    }, 100);

                    $('.leaflet-popup').on('mouseover', function (e) {
                        clearTimeout(timeout);
                        $('.leaflet-popup').off('mouseover');
                    });
                });

                return this;
            },
        });

        MapBase.map = L.map('map', {
            preferCanvas: true,
            attributionControl: false,
            minZoom: this.minZoom,
            maxZoom: this.maxZoom,
            zoomControl: false,
            crs: L.CRS.Simple,
            layers: [mapLayers[this.themeOverride || Settings.baseLayer]],
        }).setView([this.viewportX, this.viewportY], this.viewportZoom);

        MapBase.map.addControl(
            L.control.attribution({
                position: 'bottomright',
                prefix: 'Wanna help me? Send me missing or wrong data on Discord. CrozifletteMagique#9263',
            })
        );

        L.control.zoom({
            position: 'bottomright',
        }).addTo(MapBase.map);

        L.control.layers(mapLayers).addTo(MapBase.map);

        // Leaflet leaves the layer names here, with a space in front of them.
        $('.leaflet-control-layers-list span').each(function (index, node) {

            // Move the layer name (which is chosen to be our language key) into a
            // new tightly fitted span for use with our localization.
            const langKey = node.textContent.trim();
            $(node).html([' ', $('<span>').attr('data-text', langKey).text(langKey)]);
        });

        MapBase.map.on('baselayerchange', function (e) {
            Settings.baseLayer = e.name;
            MapBase.setMapBackground();
        });

        MapBase.map.on('click', function (e) {
            MapBase.addCoordsOnMap(e);
        });

        MapBase.map.doubleClickZoom[Settings.isDoubleClickZoomEnabled ? 'enable' : 'disable']();

        const southWest = L.latLng(-60, -20),
            northEast = L.latLng(20, 60),
            bounds = L.latLngBounds(southWest, northEast);
        MapBase.map.setMaxBounds(bounds);

        Layers.oms = new OverlappingMarkerSpiderfier(MapBase.map, {
            keepSpiderfied: true,
        });
        Layers.oms.addListener('spiderfy', function (markers) {
            MapBase.map.closePopup();
        });

        MapBase.map.on('resize', MapBase.map.invalidateSize);

        Layers.debugLayer.addTo(MapBase.map);
        MapBase.setMapBackground();
    },

    setMapBackground: function () {
        'use strict';
        MapBase.isDarkMode = ['map.layers.game'].includes(this.themeOverride || Settings.baseLayer) ? true : false;
        $('#map').css('background-color', (() => {
            if (MapBase.isDarkMode)
                return (this.themeOverride || Settings.baseLayer) === 'map.layers.game' ? '#000' : '#C7DEE1';
            else
                return '#C7DEE1';
        }));
    },

    beforeLoad: function () {
        // Set map to preview mode before loading.
        const previewParam = getParameterByName('q');
        if (previewParam) this.isPreviewMode = true;

        // Set map theme according to param.
        const themeParam = getParameterByName('theme');
        if (themeParam && ['default'].includes(themeParam))
            this.themeOverride = `map.layers.${themeParam}`;

        // Sets the map's default zoom level to anywhere between minZoom and maxZoom.
        const zoomParam = Number.parseInt(getParameterByName('z'));
        if (!isNaN(zoomParam) && this.minZoom <= zoomParam && zoomParam <= this.maxZoom)
            this.viewportZoom = zoomParam;

        // Pans the map to a specific coordinate location on the map for default focussing.
        const flyParam = getParameterByName('ft');
        if (flyParam) {
            const latLng = flyParam.split(',');
            if (latLng.filter(Number).length === 2) {
                this.viewportX = latLng[0];
                this.viewportY = latLng[1];
            }
        }

        // Sets all marker colors (except for plant markers) to static color.
        const colorParam = getParameterByName('c');
        if (colorParam) {
            const validColors = [
                'aquagreen', 'beige', 'black', 'blue', 'brown', 'cadetblue', 'darkblue', 'darkgreen', 'darkorange', 'darkpurple',
                'darkred', 'gray', 'green', 'lightblue', 'lightdarkred', 'lightgray', 'lightgreen', 'lightorange', 'lightred',
                'orange', 'pink', 'purple', 'red', 'white', 'yellow'
            ];

            if (validColors.includes(colorParam)) this.colorOverride = colorParam;
        }
    },

    afterLoad: function () {
        // Preview mode parameter.
        const quickParam = getParameterByName('q');
        if (quickParam) {
            MapBase.isPreviewMode = true;

            $('.menu-toggle').remove();
            $('.top-widget').remove();
            $('#fme-container').remove();
            $('.side-menu').removeClass('menu-opened');
            $('.leaflet-top.leaflet-right, .leaflet-control-zoom').remove();

            this.disableAll();

            function locationMarkerFilter(item) {
                if (item.key !== quickParam) return;
                item.onMap = true;
                if (item.markers.length !== 1) return;
                MapBase.map.setView({ lat: item.markers[0].lat, lng: item.markers[0].lng }, 5);
            }
        }

        Menu.updateTippy();
        MapBase.updateTippy('afterLoad');

        // Puppeteer hack and utility for other extensions.
        // Allows utilities to wait for this global to then do their stuff.
        window.loaded = true;
    },

    gameToMap: function (lat, lng, name = 'Debug Marker') {
        const lati = (0.0121 * lng + -23.95).toFixed(4);
        const long = (0.012 * lat + 24).toFixed(4);
        MapBase.debugMarker(lati, long, name);
        //console.log(`{"text": "${name}", "x": ${lati}, "y": ${long}}`);
        //console.log(`{"key": "adrenaline_${MapBase.index}", "x": ${lati}, "y": ${long}}`);
        //MapBase.index++;
        return { name, lati, long };
    },

    submitDebugForm: function () {
        var lat = $('input[name=debug-marker-lat]').val();
        var lng = $('input[name=debug-marker-lng]').val();
        if (!isNaN(lat) && !isNaN(lng))
            MapBase.debugMarker(lat, lng);
    },

    debugMarker: function (lat, long, name = 'Debug Marker') {
        const shadow = Settings.isShadowsEnabled ?
            `<img class="shadow" width="${35 * Settings.markerSize}" height="${16 * Settings.markerSize}" src="./assets/images/markers-shadow.png" alt="Shadow">` : '';
        var marker = L.marker([lat, long], {
            icon: L.divIcon({
                iconSize: [35 * Settings.markerSize, 45 * Settings.markerSize],
                iconAnchor: [17 * Settings.markerSize, 42 * Settings.markerSize],
                popupAnchor: [0 * Settings.markerSize, -28 * Settings.markerSize],
                html: `
          <img class="icon" src="./assets/images/icons/random.png" alt="Icon">
          <img class="background" src="./assets/images/icons/marker_${MapBase.colorOverride || 'darkblue'}.png" alt="Background">
          ${shadow}
        `,
            }),
            draggable: Settings.isDebugEnabled,
        });

        marker.bindPopup(`<h1>${name}</h1><p>Lat.: ${lat}<br>Long.: ${long}</p>`, {
            minWidth: 300,
        });
        Layers.debugLayer.addLayer(marker);

        MapBase.updateTippy('debugMarker');
    },

    testData: { data: [] },
    addCoordsOnMap: function (coords) {

        // Show clicked coordinates (like google maps)
        if (Settings.isCoordsOnClickEnabled) {
            $('.lat-lng-container').css('display', 'block');

            $('.lat-lng-container p').html(`
          Latitude: ${parseFloat(coords.latlng.lat.toFixed(4))}
          <br>Longitude: ${parseFloat(coords.latlng.lng.toFixed(4))}
        `);

            $('#lat-lng-container-close-button').click(function () {
                $('.lat-lng-container').css('display', 'none');
            });
        }
        MapBase.index++;
        //console.log(`{"text": "safehouse_${MapBase.index}", "x": ${coords.latlng.lat.toFixed(4)}, "y": ${coords.latlng.lng.toFixed(4)}},`);

        // Remove this false if you want to manually create the heatmap.
        if (false && Settings.isDebugEnabled) {
            console.log(`{ "lat": ${coords.latlng.lat.toFixed(4)}, "lng": ${coords.latlng.lng.toFixed(4)} },`);
            MapBase.testData.data.push({
                lat: coords.latlng.lat.toFixed(4),
                lng: coords.latlng.lng.toFixed(4),
            });
            AnimalCollection.heatmapLayer.setData(MapBase.testData);
        }

        if (Settings.isPinsPlacingEnabled) {
            Pins.onMap = true;
            Pins.addPin(coords.latlng);
        }
    },

    yieldingLoop: function (count, chunksize, callback, finished) {
        if (MapBase.isPreviewMode) chunksize = count;
        var i = 0;
        (function chunk() {
            var end = Math.min(i + chunksize, count);
            for (; i < end; ++i) {
                callback.call(null, i);
            }
            if (i < count) {
                setTimeout(chunk, 0);
            } else {
                finished.call(null);
            }
        })();
    },

    updateTippy: function (loc = '') {
        if (Settings.isDebugEnabled)
            console.log('UpdateTippy called from', loc);

        // This is here to deal with stacked onMap updates (show all/hide all)
        // TODO: Have a generic hook for "after update" in both all and single updates.
        // TODO: See if we can't go ahead and filter based on marker cat.
        clearTimeout(MapBase.updateTippyTimer);
        MapBase.updateTippyTimer = setTimeout(function () {
            if (Settings.isDebugEnabled)
                console.log('Updating MapBase Tippy...');

            MapBase.tippyInstances.forEach(instance => instance.destroy());
            MapBase.tippyInstances = [];

            if (!Settings.showTooltipsMap || Settings.isPopupsHoverEnabled) return;

            MapBase.tippyInstances = tippy('[data-tippy]', {
                theme: 'map-theme',
                placement: 'right',
                arrow: false,
                distance: 0,
                zIndex: 910,
                content(ref) {
                    return ref.getAttribute('data-tippy');
                },
            });
        }, 300);
    },

    // Rectangle for testing.
    _rectangle: function (x, y, width, height) {
        var currentPoint = this.map.latLngToContainerPoint([x, y]);

        var xDifference = width / 2;
        var yDifference = height / 2;

        var southWest = L.point((currentPoint.x - xDifference), (currentPoint.y - yDifference));
        var northEast = L.point((currentPoint.x + xDifference), (currentPoint.y + yDifference));

        var bounds = L.latLngBounds(this.map.containerPointToLatLng(southWest), this.map.containerPointToLatLng(northEast));
        L.rectangle(bounds).addTo(this.map);
    },

    //R* converting stuff
    _debugMarker: function (coords) {
        let temp = MapBase.map.unproject(this._gameToMap(coords), 8);
        MapBase.debugMarker(temp.lat, temp.lng);
        return { 'lat': temp.lat.toFixed(4), 'lng': temp.lng.toFixed(4) };
    },

    _gameToMap: function (coords) {
        let image = [48841, 38666],
            topLeft = [-7168, 4096],
            bottomRight = [5120, -5632];

        let i = image[0],
            n = image[1],
            e = this._normal_xy(topLeft, bottomRight),
            s = this._normal_xy(topLeft, coords);
        return [i * (s[0] / e[0]), n * (s[1] / e[1])];
    },

    _normal_xy: function (t, i) {
        return [this._num_distance(t[0], i[0]), this._num_distance(t[1], i[1])];
    },

    _num_distance: function (t, i) {
        return t > i ? t - i : i - t;
    },
};