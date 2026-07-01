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
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body, #map { width: 100%; height: 100%; overflow: hidden; }
  .pulsing-circle {
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
</style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map', {
    attributionControl: true,
    zoomControl: true,
  });

  L.tileLayer('https://tiles.openfreemap.org/planet/{z}/{x}/{y}.png', {
    attribution: '\\u00a9 <a href="https://openfreemap.org">OpenFreeMap</a>, \\u00a9 <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);

  var DEFAULT_CENTER = [-31.9333, -65.1833];
  var DEFAULT_ZOOM = 15;
  var markers = [];
  var routePolyline = null;

  function setView(center, zoom) {
    map.setView(center, zoom);
  }

  function updateMarkers(newMarkers) {
    markers.forEach(function (m) { map.removeLayer(m); });
    markers = [];
    newMarkers.forEach(function (mk) {
      var color = mk.color || '#00C2B3';
      var circle = L.circleMarker([mk.coordinate[1], mk.coordinate[0]], {
        radius: 8,
        fillColor: color,
        color: '#FFFFFF',
        weight: 2,
        fillOpacity: 1,
        opacity: 1,
      }).addTo(map);
      if (mk.title) {
        circle.bindTooltip(mk.title, {
          direction: 'top',
          offset: [0, -10],
        });
      }
      circle.id = mk.id;
      circle.on('click', function () {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'markerClick',
          id: mk.id,
        }));
      });
      markers.push(circle);
    });
  }

  function updateRoute(coordinates) {
    if (routePolyline) {
      map.removeLayer(routePolyline);
      routePolyline = null;
    }
    if (coordinates && coordinates.length >= 2) {
      var latlngs = coordinates.map(function (c) { return [c[1], c[0]]; });
      routePolyline = L.polyline(latlngs, {
        color: '#00C2B3',
        weight: 3,
        opacity: 0.9,
      }).addTo(map);
    }
  }

  var userMarker = null;
  var watchId = null;

  function startFollowUser() {
    if (!navigator.geolocation) return;
    if (watchId) return;

    watchId = navigator.geolocation.watchPosition(
      function (pos) {
        var lat = pos.coords.latitude;
        var lng = pos.coords.longitude;

        if (!userMarker) {
          var icon = L.divIcon({ className: 'pulsing-circle', iconSize: [18, 18], iconAnchor: [9, 9] });
          userMarker = L.marker([lat, lng], { icon: icon }).addTo(map);
        } else {
          userMarker.setLatLng([lat, lng]);
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
      map.removeLayer(userMarker);
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
        setView(msg.center || DEFAULT_CENTER, msg.zoom || DEFAULT_ZOOM);
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

  setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));

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
        center: [centerCoordinate[1], centerCoordinate[0]],
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
