# Product Brief — Lifty (Conductor MVP)

## Problema
Los conductores en ciudades del interior de Argentina (Villa Dolores, Traslasierra) no tienen una plataforma eficiente para conectar con pasajeros y gestionar viajes.

## Solución MVP
App para conductores que permite:
1. Registro con email + verificación
2. Onboarding en 4 pasos (datos personales → vehículo → documentos → KYC)
3. Recibir solicitudes de viaje con timer de 8s
4. State machine de viaje con 12 estados
5. Ubicación en tiempo real vía WebSocket
6. Pagos con Mercado Pago (split 80/20)
7. Earnings, ratings, SOS, notificaciones push

## User Flow Conductor

```
Welcome → Register (email+password) → Verify Email → Login → 
Terms → Onboarding Step 1 (datos) → Step 2 (vehículo) → 
Step 3 (documentos) → KYC (DIDIT) → Under Review → 
Approved → Online → Trip Request → viaje completo
```
