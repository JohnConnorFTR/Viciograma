# Extensión Viciograma para Chrome

La extensión Manifest V3 inspecciona la pestaña actual cuando el usuario abre el popup. Busca enlaces directos a audio y video en elementos `<audio>`, `<video>`, `<source>`, enlaces y recursos cargados por la página. Permite previsualizar el primer resultado (sin reproducción automática), elegir otro medio y abrir el seleccionado en Viciograma. El título se toma del nombre del archivo multimedia en la URL, sin su extensión. Cada medio tiene un máximo de cinco minutos efectivos de reproducción en la vista previa; pausar no consume el límite. No hay campos para editar el título o la descripción.

## Cargar para probar

1. Abrí `chrome://extensions` en Chrome.
2. Activá **Modo de desarrollador**.
3. Elegí **Cargar descomprimida** y seleccioná esta carpeta `chrome-extension`.
4. Abrí una página de alojamiento, esperá que cargue y pulsá el icono de Viciograma.

No hace falta configurar permisos de sitios por adelantado. `activeTab` y `scripting` permiten inspeccionar solo la pestaña actual después de que el usuario abre la extensión. No hay escaneo en segundo plano, captura de credenciales, redirecciones automáticas ni reproducción automática.

## Formatos y límites

Se buscan URLs que terminen en formatos de audio/video comunes (`mp3`, `m4a`, `wav`, `ogg`, `mp4`, `webm`, `m3u8`, entre otros). Los enlaces `blob:` y `data:` se excluyen. Un enlace protegido por autenticación, token temporal, CORS, DRM o restricciones del alojamiento puede no funcionar en la vista previa. La extensión no descarga ni extrae archivos del servidor; solo lee URLs que la página ya expone al navegador.

Al abrir en Viciograma, el popup genera el enlace del reproductor con el título derivado del nombre de archivo en la URL. Esto permite que el título y la clave de comentarios coincidan entre la página de alojamiento y el enlace directo del medio.

Si no aparecen enlaces, esperá a que la página termine de cargar y abrí de nuevo el popup. Algunas páginas solo revelan la URL después de una interacción, o no la exponen en el DOM.
