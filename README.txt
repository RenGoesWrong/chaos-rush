CHAOS RUSH v0.3 — PRIMERA CARRERA JUGABLE

ARCHIVOS
- index.html
- style.css
- game.js
- firebase-rules.json

PUBLICAR
1. En GitHub, abre el repositorio RenGoesWrong/chaos-rush.
2. Reemplaza los tres archivos de la raíz: index.html, style.css y game.js.
3. Sube también firebase-rules.json como referencia (no se ejecuta desde la web).
4. En Firebase Console > Realtime Database > Rules, reemplaza las reglas actuales por el contenido de firebase-rules.json y pulsa Publish.
5. Espera a que Cloudflare Pages termine el despliegue.

PROBAR
1. Abre https://chaos-rush.pages.dev en la computadora.
2. Crea una sala.
3. En cada celular abre el link o escribe el código de 6 letras.
4. Cada jugador toca LISTO.
5. En la computadora pulsa ARRANCAR CARRERA.
6. En computadora se controla con WASD o flechas y SHIFT para nitro. Los celulares tienen joystick, acelerador, freno y nitro.

IMPORTANTE
- Firebase Authentication debe tener habilitado Anonymous.
- Realtime Database debe estar activa.
- Esta versión usa la computadora anfitriona como simulador autoritativo; los celulares envían sus controles por Firebase.
- Es una primera versión jugable: el circuito y la física arcade son base para añadir después derrapes avanzados, objetos, pistas alternativas y eventos CAOS.
- La API Key incluida es la configuración web del proyecto Firebase que ya estabas usando. Las reglas de RTDB son necesarias para permitir que cada jugador escriba únicamente sus controles y que solo el anfitrión escriba el estado de carrera.
