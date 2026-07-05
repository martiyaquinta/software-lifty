import { theme } from '@/theme';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, type ViewStyle } from 'react-native';
import WebView from 'react-native-webview/lib/WebView';
import type { WebViewMessageEvent } from 'react-native-webview/lib/WebViewTypes';

const WebViewComponent = WebView as any;

interface MarkerData {
  id: string;
  coordinate: [number, number];
  title?: string;
  color?: string;
}

interface MapViewProps {
  centerCoordinate?: [number, number];
  zoom?: number;
  markers?: MarkerData[];
  routeLine?: Array<[number, number]>;
  followUserLocation?: boolean;
  style?: ViewStyle;
}

const DEFAULT_CENTER: [number, number] = [-65.1833, -31.9333];
const DEFAULT_ZOOM = 15;

const MAP_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
<link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body, #map { width: 100%; height: 100%; overflow: hidden; }
  .maplibregl-ctrl-attrib {
    font-size: 10px !important;
  }
  .pulsing-marker {
    width: 18px; height: 18px;
    background: rgba(0, 194, 179, 0.4);
    border: 2px solid #00C2B3;
    border-radius: 50%;
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0% { transform: scale(0.5); opacity: 0.8; }
    100% { transform: scale(2.5); opacity: 0; }
  }
  .custom-marker {
    width: 20px; height: 20px;
    border-radius: 50%;
    border: 2px solid #FFFFFF;
    box-shadow: 0 1px 4px rgba(0,0,0,0.3);
  }
  .marker-label {
    position: absolute;
    bottom: -18px;
    left: 50%;
    transform: translateX(-50%);
    white-space: nowrap;
    font-size: 11px;
    font-weight: 600;
    background: rgba(255,255,255,0.9);
    padding: 1px 5px;
    border-radius: 3px;
    color: #333;
    pointer-events: none;
  }
</style>
</head>
<body>
<div id="map"></div>
<script>
  var DEFAULT_CENTER = [-65.1833, -31.9333];
  var DEFAULT_ZOOM = 15;

  var map = new maplibregl.Map({
    container: 'map',
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    attributionControl: true,
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-right');

  var routeSourceId = 'route-source';
  var routeLayerId = 'route-layer';

  map.on('load', function () {
    map.addSource(routeSourceId, {
      type: 'geojson',
      data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
    });

    map.addLayer({
      id: routeLayerId,
      type: 'line',
      source: routeSourceId,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#00C2B3', 'line-width': 4, 'line-opacity': 0.9 },
    });
  });

  var existingMarkers = [];
  var userMarker = null;
  var watchId = null;

  function updateMarkers(newMarkers) {
    existingMarkers.forEach(function (m) { m.remove(); });
    existingMarkers = [];

    newMarkers.forEach(function (mk) {
      var color = mk.color || '#00C2B3';
      var el = document.createElement('div');
      el.className = 'custom-marker';
      el.style.backgroundColor = color;

      if (mk.title) {
        var label = document.createElement('span');
        label.className = 'marker-label';
        label.textContent = mk.title;
        el.appendChild(label);
      }

      var marker = new maplibregl.Marker({ element: el })
        .setLngLat([mk.coordinate[0], mk.coordinate[1]])
        .addTo(map);

      el.addEventListener('click', function () {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'markerClick',
          id: mk.id,
        }));
      });

      existingMarkers.push(marker);
    });
  }

  function updateRoute(coordinates) {
    if (!map.getSource(routeSourceId)) return;

    var geojson = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: (coordinates && coordinates.length >= 2)
          ? coordinates.map(function (c) { return [c[0], c[1]]; })
          : [],
      },
    };

    map.getSource(routeSourceId).setData(geojson);
  }

  function startFollowUser() {
    if (!navigator.geolocation) return;
    if (watchId) return;

    watchId = navigator.geolocation.watchPosition(
      function (pos) {
        var lat = pos.coords.latitude;
        var lng = pos.coords.longitude;

        if (!userMarker) {
          var el = document.createElement('div');
          el.className = 'pulsing-marker';
          userMarker = new maplibregl.Marker({ element: el })
            .setLngLat([lng, lat])
            .addTo(map);
        } else {
          userMarker.setLngLat([lng, lat]);
        }
      },
      function () {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
  }

  function stopFollowUser() {
    if (watchId) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    if (userMarker) {
      userMarker.remove();
      userMarker = null;
    }
  }

  map.on('moveend', function () {
    var c = map.getCenter();
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'moved',
      center: { lng: c.lng, lat: c.lat },
      zoom: map.getZoom(),
    }));
  });

  window.addEventListener('message', function (event) {
    var msg;
    try {
      msg = JSON.parse(event.data);
    } catch (e) {
      return;
    }

    switch (msg.type) {
      case 'init':
        map.jumpTo({
          center: msg.center || DEFAULT_CENTER,
          zoom: msg.zoom || DEFAULT_ZOOM,
        });
        break;
      case 'markers':
        updateMarkers(msg.markers || []);
        break;
      case 'route':
        updateRoute(msg.coordinates || []);
        break;
      case 'followUser':
        if (msg.enabled) startFollowUser();
        else stopFollowUser();
        break;
    }
  });

  map.once('idle', function () {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
  });

  window.addEventListener('error', function (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'error',
      message: e.message || 'Unknown error',
    }));
  });
</script>
</body>
</html>`;

export const MapView: React.FC<MapViewProps> = ({
  centerCoordinate = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  markers = [],
  routeLine,
  followUserLocation = false,
  style,
}) => {
  const webViewRef = useRef<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!isLoaded || !webViewRef.current) return;

    webViewRef.current.postMessage(
      JSON.stringify({
        type: 'init',
        center: centerCoordinate,
        zoom: zoom,
      }),
    );
  }, [centerCoordinate, zoom, isLoaded]);

  useEffect(() => {
    if (!isLoaded || !webViewRef.current) return;

    webViewRef.current.postMessage(
      JSON.stringify({
        type: 'markers',
        markers: markers,
      }),
    );
  }, [markers, isLoaded]);

  useEffect(() => {
    if (!isLoaded || !webViewRef.current) return;

    webViewRef.current.postMessage(
      JSON.stringify({
        type: 'route',
        coordinates: routeLine || [],
      }),
    );
  }, [routeLine, isLoaded]);

  useEffect(() => {
    if (!isLoaded || !webViewRef.current) return;

    webViewRef.current.postMessage(
      JSON.stringify({
        type: 'followUser',
        enabled: followUserLocation,
      }),
    );
  }, [followUserLocation, isLoaded]);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      switch (data.type) {
        case 'moved':
          break;
        case 'markerClick':
          break;
        case 'ready':
          break;
        case 'error':
          break;
      }
    } catch {}
  }, []);

  return (
    <View style={[styles.container, style]}>
      <WebViewComponent
        ref={webViewRef}
        source={{ html: MAP_HTML }}
        style={styles.webview}
        onLoadEnd={() => setIsLoaded(true)}
        onMessage={handleMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        geolocationEnabled={true}
        startInLoadingState={true}
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.turquoise} />
          </View>
        )}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        originWhitelist={['*']}
      />
      {!isLoaded && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={theme.colors.turquoise} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.lightGray,
  },
  loadingOverlay: {
    ...(StyleSheet.absoluteFill as object),
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.lightGray,
  },
});
