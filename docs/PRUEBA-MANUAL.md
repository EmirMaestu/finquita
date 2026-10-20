# Prueba manual en equipos reales

Lo que la QA automática (Chromium en el VPS, cámara y pistola simuladas) no puede comprobar. Pasos cortos, para hacer en el local con la Mac del mostrador, el iPhone y la impresora. Anotá al lado de cada paso si pasó o qué viste.

## iPhone (Safari y PWA instalada)

1. **Instalar.** Abrí el subdominio en Safari. En Inicio tiene que aparecer una franja "Instalá Mostrador en tu iPhone · Ver cómo" (una línea, no una tarjeta grande). Compartir → Agregar a inicio. Abrila desde el ícono: la franja ya no tiene que estar.
2. **Cámara en Vender.** Vender › botón verde de cámara. Apuntá a una Coca-Cola: en menos de 1 s el recuadro parpadea en verde, suena el pitido, aparece "Agregado: Coca-Cola 2,25 L" y abajo del visor "1 ítem · $ 4.600". Dejá el producto en cuadro: a los 1,5 s suma la segunda unidad ("× 2").
3. **Cámara y pesable.** Escaneá el código de la planilla del pan: la cámara se cierra sola y aparece el teclado de peso. Tipeá 350 → 0,350 kg.
4. **Código nuevo.** Escaneá algo que no esté cargado: la cámara se cierra y aparece "El código … no está cargado" con Crear producto rápido.
5. **Foco de cerca (iPhone Pro).** Con la cámara principal, a 10-15 cm el código puede salir borroso. Probá a 20-25 cm. Si no lee nunca de cerca, anotalo (es el C09 de la auditoría de cámara: hay que pedir zoom o la ultra gran angular).
6. **Pitido en silencio.** Con el interruptor de silencio del iPhone activado, escaneá: no va a sonar, pero el flash verde y el cartel "Agregado" tienen que verse igual.
7. **Sin internet.** Modo avión. Vendé: el chip de arriba dice "Sin conexión · 1 venta por sincronizar". Recibí mercadería sin pedido: confirma al instante y dice "guardada en el dispositivo". Sacá el modo avión: el chip pasa a "Todo sincronizado" y la venta está en Caja.
8. **Notificaciones push.** Avisos › Activar notificaciones (solo con la app instalada). Cerrá un turno desde la Mac: tiene que llegar el aviso al iPhone con la app cerrada.
9. **Modo carga con cámara.** Productos › Más acciones › Modo carga › Abrir la cámara. Después de guardar un producto la cámara vuelve sola.
10. **Recepción con cámara.** Compras › Recepción › un pedido › Cámara. Después de "Listo" en una línea, la cámara vuelve sola para el próximo producto.

## Mac del mostrador (Chrome y pistola USB)

1. **Pistola en Vender.** Sin hacer clic en nada, escaneá tres productos seguidos: entran los tres y el buscador queda vacío.
2. **Pistola con el cobro abierto.** F12 y escaneá: el código no tiene que escribirse en el monto (pitido de error, nada más).
3. **Tipear el efectivo.** F12, tipeá 10000 a la velocidad normal de un cajero y Enter: "Vuelto …" correcto, sin perder ceros.
4. **Teclado solo.** Una venta entera sin mouse: F12, 5000, Enter (agrega el pago), T (Tarjeta), Ctrl+Enter. La pantalla verde tiene que decir "efectivo + débito".
5. **Pantalla verde.** Con la pantalla verde a la vista, tipeá 2 y * y escaneá: la venta nueva arranca con 2 unidades.
6. **Bloqueo por inactividad.** Dejá la Mac 5 minutos sin tocar (sin venta en curso): pide PIN y no hay "Volver".
7. **Cajero y caja.** Entrá con el PIN de un cajero: el chip "Caja abierta · …" de arriba lleva a Caja; desde ahí se cierra el turno. Si la caja la abrió otro, Vender lo dice arriba.
8. **Búsqueda global.** Ctrl+K: "cerrar caja" lleva al arqueo; "yerba" muestra el producto; "rosa" la clienta.

## Impresora térmica y cajón

1. **Ticket de 58 mm.** Vendé con "Imprimir": sale el ticket con los renglones alineados (nombre, cantidad × precio, total, vuelto y "Documento no válido como factura"). Probá también en 80 mm desde Ajustes › Tickets.
2. **Impresora apagada.** Apagala y vendé con "Imprimir": la venta se guarda igual; Chrome muestra su diálogo de impresión o un error. Anotá qué ve el cajero (la app todavía no tiene "Impresora desconectada · Reintentar").
3. **Cajón.** F10 con impresora conectada: se abre el cajón. Sin impresora, el aviso dice "abrilo a mano".
4. **Comprobante de cierre.** Cerrá un turno e imprimí el comprobante: "Cajero" es quien abrió y, si cerró otra persona, aparece "Cerró: …".

## Lo que conviene mirar en datos reales

- Cuánto tarda la primera bajada del catálogo en un iPhone recién instalado con 4G (C10 de la auditoría de cámara): mientras baja, un código real puede decir "no está cargado".
- Con 10.000 productos, que buscar y sumar a la venta siga siendo instantáneo.
