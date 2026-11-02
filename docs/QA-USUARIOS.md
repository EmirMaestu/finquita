# QA con usuarios · hallazgos fusionados

Ronda 1 (19/10/2026): cinco usuarios nuevos recorrieron la app en Chromium con un driver propio (scripts/qa/driver.ts), cada uno en una instalación aislada (E2E_SLOT 1 a 5). Sus informes están en `qa/ronda-1/<usuario>.md` (carpeta ignorada por git) y acá se fusionan con las auditorías previas de `docs/auditoria/` (cámara C01-C20 y UI U01-U144).

- **Los usuarios:** el apurado (cajero, Mac, solo teclado y pistola), el desconfiado (dueño, Mac, instalación vacía), el del celular (dueño, iPhone 375 px, 3G y cortes de red), la literal (repositora, iPhone 393 px) y el destructor (dos tamaños, cuatro roles, basura en cada formulario).
- **Orden:** por cuántos usuarios lo vieron y, a igualdad, por gravedad (bloquea › confunde › molesta). La gravedad de cada Q es la más alta entre quienes lo reportaron.
- **Estado:** `abierto` hasta que una ronda entera no lo vuelva a ver; entonces `arreglado`. Lo que contradiga el spec o el diseño va a BLOCKERS.md sin tocarse.
- **Capturas:** rutas dentro de `qa/` (local). `pasos/NNN-…` son las capturas automáticas de cada paso; las demás, las que el usuario sacó al trabarse.

## Resumen

| | bloquea | confunde | molesta | total |
| --- | --- | --- | --- | --- |
| Vistos por usuarios (ronda 1) | 17 | 50 | 24 | 91 |
| Solo en las auditorías | 7 | 61 | 48 | 116 |

Problemas por usuario: apurado 13 · desconfiado 18 · celular 23 · literal 25 · destructor 27. Hallazgos de auditoría que algún usuario volvió a ver: 44.

## Ronda 2 (20/10/2026)

Instalaciones nuevas, los mismos cinco usuarios y el mismo recorrido, después de T48 a T62. Informes en `qa/ronda-2/<usuario>.md`. Un Q pasa a `arreglado` solo si ningún usuario lo volvió a ver; lo que sigue o es nuevo se arregla en T64 y se vuelve a probar en la ronda 3.

| | bloquea | confunde | molesta | total |
| --- | --- | --- | --- | --- |
| Nuevos en la ronda 2 | 3 | 19 | 12 | 34 |

Problemas por usuario: apurado 11 · desconfiado 13 · celular 12 · literal 13 · destructor 29 (78 en total). Q de la ronda 1 que alguien volvió a ver: 30 de 91; el resto pasa a arreglado. Los nuevos van numerados después del último Q de la ronda 1.

## Hallazgos vistos por los usuarios

### Q01 · Los dígitos tipeados rápido se pierden (cobro, peso, fondo): el detector de la pistola se los come, y la pistola escribe dentro del cobro

- **Gravedad:** bloquea · **Estado:** sigue (ronda 2: apurado P03 confunde · desconfiado P01 bloquea · destructor P02 bloquea)
- **Quiénes:** apurado (P08 bloquea) · desconfiado (P08 confunde · P18 confunde)
- **Pantalla:** Vender › Cobro · Teclado de peso · Abrir turno (Total directo) · **Tamaño:** Mac · **Rol:** cajero, dueño
- **Qué pasa:** "10000" tipeado de corrido queda "$ 1" y Ctrl+Enter agrega un pago de $ 1 en vez de cobrar; "350" en el peso queda 0,003 kg ($ 63 de jamón); "15000" en el fondo abre "El código 15000 no está cargado". Un escaneo con el cobro abierto suma dígitos al monto.
- **Cómo debería ser:** § Requisitos transversales, pistola: se reconoce por velocidad "en Vender se escanea sin hacer clic en el buscador"; DECISIONS T19/T20: lo frenado se devuelve si no es código. Con un campo numérico de un diálogo enfocado no hay que frenar nada, y con el cobro abierto un escaneo no debe escribir en el monto.
- **Capturas:** `qa/ronda-1/apurado/06-cobro-quedo-con-pago-de-1-peso-y-no-confirmo.png` · `qa/ronda-1/desconfiado/pasos/041-38-peso.png` · `qa/ronda-1/desconfiado/19-tipeo-de-fondo-tomado-como-codigo.png`
- **Nota:** Los usuarios de la QA tipean con 0 a 40 ms entre teclas, más rápido que una persona (el umbral es 50 ms). Aun así, el fondo y el peso no deberían pasar por el detector.

### Q02 · Un código desconocido leído con la cámara no ofrece cargarlo

- **Gravedad:** confunde · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** celular (P04 confunde) · literal (P03 confunde) · auditoría: U16, C19
- **Pantalla:** Vender › Cámara · Productos › Escanear (barra superior) · **Tamaño:** iPhone · **Rol:** dueño, repositor
- **Qué pasa:** Fuera de Vender, el toast rojo "El código … no está cargado" desaparece solo y no hay forma de cargar el producto desde ahí. En Vender el diálogo queda tapado por la cámara (ver el Q de la cámara) y parece que se ignoró.
- **Cómo debería ser:** § Vender, "Código desconocido… Crear producto rápido o Vender como varios"; § Productos 3, alta rápida "Diez segundos y sigue la venta".
- **Capturas:** `qa/ronda-1/literal/06-camara-codigo-nuevo.png` · `qa/ronda-1/celular/08-codigo-inexistente-en-camara.png`
- **Nota:** Parte de lo visto se debió a la guía de la QA: los códigos 7798765432109, …116, …123 y …130 tienen dígito verificador inválido y ningún lector los decodifica (un código impreso siempre lo tiene bien). La ronda 2 usa códigos válidos.

### Q03 · Un pedido en Borrador no se puede recibir: hay que adivinar "Marcar enviado"

- **Gravedad:** confunde · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** celular (P09 confunde) · literal (P17 bloquea)
- **Pantalla:** Compras › Pedidos › Detalle · Compras › Recepción · **Tamaño:** iPhone · **Rol:** dueño
- **Qué pasa:** El 0042 está en Borrador (así lo deja el escenario: se manda el martes). Si el camión llega igual, el detalle solo ofrece Enviar por WhatsApp, Marcar enviado, PDF y Cancelar; en Recepción no aparece. Los dos usuarios tocaron "Marcar enviado" a ciegas para que aparezca "Recibir mercadería".
- **Cómo debería ser:** § Compras 5: recepción "desde un pedido o sin pedido"; § Compras 3: Confirmado se marca a mano. En el borrador, una salida "Ya llegó: recibir" (o que Recepción liste también los borradores con aviso).
- **Capturas:** `qa/ronda-1/literal/17-pedido-0042-botones.png` · `qa/ronda-1/celular/19-pedido-0042-borrador-sin-recibir.png`
- **Nota:** La consigna de la QA decía que el 0042 "está para recibir"; el spec lo deja como borrador hasta el martes, así que el "bloquea" de la literal se baja a confunde. Igual, la falta de salida desde el borrador es real.

### Q04 · La línea de tiempo del pedido muestra el borrador a las 18:30 (en el futuro) y el envío antes

- **Gravedad:** confunde · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** celular (P10 confunde) · literal (P19 confunde)
- **Pantalla:** Compras › Pedidos › Detalle · **Tamaño:** iPhone · **Rol:** dueño
- **Qué pasa:** "19/10 18:30 Borrador" y debajo "19/10 16:41 Enviado". El seed pone el borrador a las 18:30 de hoy aunque todavía no sean las 18:30.
- **Cómo debería ser:** § Datos de ejemplo (sábado 18:40): el seed tiene que armar las horas relativas a ahora, nunca en el futuro.
- **Capturas:** `qa/ronda-1/celular/20-linea-de-tiempo-horas-al-reves.png` · `qa/ronda-1/literal/18-linea-tiempo-horas.png`

### Q05 · Las listas de Compras se cortan por la derecha en el iPhone y el título se repite

- **Gravedad:** confunde · **Estado:** sigue (ronda 2: literal P13 molesta)
- **Quiénes:** celular (P14 molesta) · literal (P16 molesta) · auditoría: U142, U141, U51
- **Pantalla:** Compras › Pedidos · Proveedores · Detalle del pedido · **Tamaño:** iPhone · **Rol:** dueño
- **Qué pasa:** "$ 186." y "$ 243." cortados, pestaña "Recepció", "Nuevo pedido fi…", filtro "Confirm…"; en Proveedores el título "Proveedores · 6 · A pagar $ 525.600 · Nuevo" se parte en tres líneas y la ficha se dibuja debajo de toda la lista. "Compras" aparece en la barra y otra vez como título. En el detalle los encabezados salen pegados: "PedidoConfirm.Recibido".
- **Cómo debería ser:** § Compras, "Celular y compu": en celular el detalle apila por línea lo pedido, lo confirmado y lo recibido; docs/design 05 Compras (393 px).
- **Capturas:** `qa/ronda-1/celular/17-compras-lista-cortada-derecha.png` · `qa/ronda-1/literal/15-compras-cortado.png` · `qa/ronda-1/literal/pasos/037-37-pedido-0042.png`

### Q06 · Los valores de ejemplo en gris parecen cargados: Recepción, Ajustar stock y Nuevo producto

- **Gravedad:** confunde · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** celular (P11 confunde) · literal (P06 confunde · P12 confunde · P20 confunde)
- **Pantalla:** Compras › Recepción › línea · Productos › Ajustar stock · Productos › Nuevo producto · **Tamaño:** iPhone · **Rol:** dueño, repositor
- **Qué pasa:** En Recepción el campo "Recibido" muestra la cantidad pedida en gris: tocar "−" cuatro veces deja 0, y "Listo" sin escribir no carga nada (el renglón sigue "6 → …" y el avance en 0 de 14). En Ajustar stock la cantidad muestra un "2" gris con el botón apagado. En Nuevo producto todos los campos parecen llenos (Yerba Playadito 1 kg, 4850, 6900, 7791234000012, 8).
- **Cómo debería ser:** Sistema de diseño (§ Sistema de diseño, campos): el placeholder tiene que distinguirse del valor; en Recepción, lo pedido como valor inicial real ("Listo" confirma lo pedido) o el campo vacío con "Pedido 24" al lado.
- **Capturas:** `qa/ronda-1/celular/21-recibido-tras-4-menos.png` · `qa/ronda-1/literal/20-listo-sin-cargar.png` · `qa/ronda-1/literal/08-ajuste-2-fantasma.png` · `qa/ronda-1/literal/12-nuevo-producto-campos-grises.png`

### Q07 · Después de "Recepción confirmada" el pedido sigue en Recepciones esperadas sin decir que quedó parcial

- **Gravedad:** confunde · **Estado:** sigue (ronda 2: celular P03 confunde · literal P03 bloquea)
- **Quiénes:** literal (P22 confunde) · celular (P08 (parte))
- **Pantalla:** Compras › Recepción · **Tamaño:** iPhone · **Rol:** dueño, repositor
- **Qué pasa:** Con un faltante, el pedido vuelve a la lista igual que antes, con botón "Recibir", como si no se hubiera recibido. Nada dice "Recibido parcial · faltan 2 yogures".
- **Cómo debería ser:** § Compras 3: estado "Recibido parcial o total" visible; § Compras, Estados: "Recepción con diferencias: resumen".
- **Capturas:** `qa/ronda-1/literal/23-recepcion-confirmada-pero-sigue.png`

### Q08 · El aviso de código repetido queda al final del formulario, fuera de la vista

- **Gravedad:** confunde · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** literal (P15 molesta) · destructor (P13 confunde)
- **Pantalla:** Productos › Nuevo producto · **Tamaño:** iPhone · **Rol:** dueño
- **Qué pasa:** Al guardar con un código que ya existe (o con cualquier error de validación) parece que no pasa nada; el texto "El código … ya es de Coca-Cola 2,25 L" o "Revisá los datos" está abajo de todo, tapado por la barra de botones.
- **Cómo debería ser:** § Sistema de diseño: el error junto al campo o arriba, con scroll al error.
- **Capturas:** `qa/ronda-1/literal/14-codigo-ya-existe.png` · `qa/ronda-1/destructor/iphone/03-guardar-sin-feedback-visible-iphone.png`

### Q09 · El cobro abre con "Recibido $ 25.350" y "Falta $ 25.350" a la vez

- **Gravedad:** confunde · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** celular (P15 confunde) · desconfiado (P09 confunde)
- **Pantalla:** Vender › Cobro · **Tamaño:** ambos · **Rol:** todos los que venden
- **Qué pasa:** El efectivo viene precargado con el total ("Justo") pero la columna de pagos dice que falta todo, en naranja, con vuelto $ 0. No se sabe si está cobrado o si hay que tipear.
- **Cómo debería ser:** § Vender, Cobro: "El saldo que falta se ve siempre" y el vuelto en grande; docs/design 02 Vender (cobro).
- **Capturas:** `qa/ronda-1/desconfiado/07-cobro-recibido-y-falta-a-la-vez.png` · `qa/ronda-1/celular/10-cobro-falta-vs-recibido.png`

### Q10 · El cuadro de cobro no entra en la pantalla: QR en la Mac y "Confirmar cobro" en el iPhone

- **Gravedad:** confunde · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** apurado (P10 molesta) · celular (P15 (parte))
- **Pantalla:** Vender › Cobro · **Tamaño:** ambos · **Rol:** todos los que venden
- **Qué pasa:** En la Mac (1280×800) al elegir Transferencia o QR el cuadro crece y "Confirmar cobro" queda cortado abajo. En el iPhone de 375 px el botón está debajo del pliegue: hay que bajar para encontrarlo.
- **Cómo debería ser:** § Vender, Cobro: "hoja en celular, ventana en compu" con Confirmar siempre visible; docs/design 02 Vender.
- **Capturas:** `qa/ronda-1/apurado/07-cobro-qr-no-entra-en-pantalla.png` · `qa/ronda-1/celular/11-cobro-abajo.png`

### Q11 · El cajero entra sobre el turno abierto de otro sin que nadie se lo diga, y el cierre lo firma el que lo abrió

- **Gravedad:** confunde · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** apurado (P01 confunde · P15 confunde) · destructor (P24 (parte))
- **Pantalla:** Vender (al entrar con PIN) · Caja › Cierre · **Tamaño:** Mac · **Rol:** cajero
- **Qué pasa:** Tomás entra con PIN y cae en Vender con "Caja abierta · Carlos Díaz"; vende 15 veces y cierra, y el comprobante dice "Cajero: Carlos Díaz". Si falta plata, el dueño mira al que no estaba.
- **Cómo debería ser:** § Caja: "Un turno va de la apertura al cierre de una persona"; cierre "Cierre turno tarde (Tomás)". Al entrar otro cajero con turno abierto: avisar y ofrecer cerrar el anterior; el cierre con quien cierra.
- **Capturas:** `qa/ronda-1/apurado/01-caja-ya-abierta-por-carlos.png` · `qa/ronda-1/apurado/16-turno-cerrado-dice-cajero-carlos.png`

### Q12 · La cajera ve Reportes con "Ventas $ 0 · Tickets 0" sin aclarar que son solo sus ventas

- **Gravedad:** confunde · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** desconfiado (P16 confunde) · destructor (P24 confunde)
- **Pantalla:** Reportes › Ventas · **Tamaño:** Mac · **Rol:** cajero
- **Qué pasa:** Reportes figura en el menú; adentro todo en cero ("Por cajero: Nada en este período"). Después de vender toda la tarde, parece que se perdieron las ventas.
- **Cómo debería ser:** § Usuarios y permisos, matriz: el cajero ve solo sus ventas; DECISIONS T43. Aclarar "Tus ventas" o quitar Reportes del menú del cajero.
- **Capturas:** `qa/ronda-1/desconfiado/15-cajera-reportes.png`

### Q13 · La cámara llena la consola de advertencias "Could not create a Canvas element"

- **Gravedad:** molesta · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** celular (P20 molesta) · literal (P26 molesta)
- **Pantalla:** Cualquier cámara · **Tamaño:** iPhone · **Rol:** todos
- **Qué pasa:** Entre 5 y 17 console.warning por apertura, de ZXing al intentar rotar el cuadro (TRY_HARDER). La lectura funciona igual.
- **Cómo debería ser:** Consola limpia; o ZXing sin el intento de rotación que falla en el navegador.
- **Capturas:** `qa/ronda-1/celular/04-camara-abierta.png`

### Q14 · "Instalá Mostrador en tu iPhone" ocupa el tercio superior de todas las pantallas

- **Gravedad:** molesta · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** celular (P06 molesta) · literal (P08 molesta) · auditoría: U144
- **Pantalla:** Todas · **Tamaño:** iPhone · **Rol:** todos
- **Qué pasa:** La tarjeta de instalación sigue al usuario a Inicio, Vender, Productos, Compras, la ficha, la recepción… y tapa lo importante hasta que se cierra. Entrando con 3G lo primero que se ve es eso, no el negocio.
- **Cómo debería ser:** § Arquitectura técnica (PWA): guía de instalación para iPhone, pero una vez y chica; § Inicio: el panel del día es lo primero.
- **Capturas:** `qa/ronda-1/literal/01-inicio-tareas.png` · `qa/ronda-1/celular/pasos/002-02-login.png`

### Q15 · La pantalla Avisos no tiene título en la barra ni forma de volver

- **Gravedad:** molesta · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** celular (P05 (parte)) · literal (P24 molesta) · auditoría: U98
- **Pantalla:** Avisos · **Tamaño:** iPhone · **Rol:** todos
- **Qué pasa:** La barra de arriba queda vacía a la izquierda; para salir hay que usar la barra inferior.
- **Cómo debería ser:** § Navegación: barra superior con el módulo; docs/design 06 Inicio (Avisos).
- **Capturas:** `qa/ronda-1/literal/pasos/023-23-campana.png` · `qa/ronda-1/celular/02-avisos-vacios-pero-inicio-dice-4.png`

### Q16 · Con la cámara abierta, el teclado de peso y el diálogo de código desconocido se abren detrás del visor y los escaneos siguientes se descartan

- **Gravedad:** bloquea · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** celular (P02 bloquea) · auditoría: C01, C02, C03
- **Pantalla:** Vender › Cámara · **Tamaño:** iPhone · **Rol:** todos los que venden
- **Qué pasa:** Al leer un pesable (o un código que no existe) la app abre el diálogo debajo de la cámara: en pantalla sigue el visor negro con el código y nada más. El usuario espera sin saber qué pasó; mientras tanto cada escaneo nuevo se descarta con pitido de error. Solo al cerrar la cámara con la X aparece el teclado de peso.
- **Cómo debería ser:** § Vender, "Pesables… un teclado pide el peso" y "Código desconocido… con dos salidas"; § Flujos 2 y 3. Cerrar la cámara al abrir cualquier diálogo (o dibujarlo por encima).
- **Capturas:** `qa/ronda-1/celular/06-pesable-dialogo-tapado-por-camara.png`

### Q17 · La cámara no avisa cuando lee un producto

- **Gravedad:** bloquea · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** celular (P01 confunde) · auditoría: C05, C06
- **Pantalla:** Vender › Cámara · **Tamaño:** iPhone · **Rol:** todos los que venden
- **Qué pasa:** Después de leer el código no cambia nada en pantalla: ni cartel, ni contador, ni flash. Recién al cerrar la cámara se ve que los productos entraron. El pitido no alcanza (en iPhone en silencio no suena).
- **Cómo debería ser:** § Requisitos transversales, Hardware: "Escaneo continuo con pitido y aviso 'Agregado: Yerba 1 kg'". Toast sobre la cámara (ya va en z-60) y contador "3 ítems · $ 18.550" dentro del visor.
- **Capturas:** `qa/ronda-1/celular/05-camara-tras-leer-yerba.png`

### Q18 · Confirmar la recepción sin internet se cuelga sin ningún mensaje

- **Gravedad:** bloquea · **Estado:** sigue (ronda 2: celular P02 bloquea)
- **Quiénes:** celular (P08 bloquea) · auditoría: U07, U32
- **Pantalla:** Compras › Recepción › Confirmar · **Tamaño:** iPhone · **Rol:** dueño, repositor
- **Qué pasa:** Con la red cortada, "Confirmar igual" queda gris más de 22 s sin rueda ni texto; el chip de arriba dice "Caja abierta" en verde, nunca "Sin conexión". Al reconectar vuelve sola a la lista sin decir nada, y el pedido sigue con botón "Recibir" (quedó parcial). Se guardó una sola vez, pero el usuario no lo sabe.
- **Cómo debería ser:** § Requisitos transversales: "Nunca falla en silencio"; DECISIONS T38: la recepción viaja por la cola y sirve sin conexión. Debería decir "Guardado en el dispositivo, se manda al volver internet" y terminar al instante.
- **Capturas:** `qa/ronda-1/celular/27-recepcion-offline-22s-colgada.png` · `qa/ronda-1/celular/29-recepcion-reconectada-9s.png`

### Q19 · El estado del pedido sale en inglés en la ficha del proveedor: "sent", "draft"

- **Gravedad:** bloquea · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** celular (P13 molesta) · auditoría: U14
- **Pantalla:** Compras › Proveedores › Ficha › Pedidos · **Tamaño:** ambos · **Rol:** dueño, encargado
- **Qué pasa:** "Pedido 0041 · sent".
- **Cómo debería ser:** § Compras 3: Borrador, Enviado, Confirmado…; CLAUDE.md: UI en español rioplatense.
- **Capturas:** `qa/ronda-1/celular/32-ficha-andina-pedidos-sent.png`

### Q20 · El repositor ve la pestaña Compras pero adentro lo rechaza con candado, y no puede recibir

- **Gravedad:** bloquea · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** literal (P02 bloquea) · auditoría: U140, U34
- **Pantalla:** Compras (barra inferior) · **Tamaño:** iPhone · **Rol:** repositor
- **Qué pasa:** "Compras" lleva a Pedidos, que para el repositor devuelve "No tenés permiso para ver esto". Recibir mercadería (su tarea según el spec) queda inaccesible.
- **Cómo debería ser:** § Usuarios y permisos: el repositor recibe mercadería; § Navegación, barra inferior: Compras abre "Pedidos, recepción, proveedores". Para el repositor, Compras tiene que abrir Recepción y ocultar el resto.
- **Capturas:** `qa/ronda-1/literal/04-compras-sin-permiso.png`

### Q21 · En el iPhone no existen Modo carga ni "Nuevo producto" con nombre; el repositor no puede cargar nada

- **Gravedad:** bloquea · **Estado:** sigue (ronda 2: literal P01 bloquea · literal P05 confunde)
- **Quiénes:** literal (P01 bloquea · P11 confunde) · auditoría: U05
- **Pantalla:** Productos · **Tamaño:** iPhone · **Rol:** repositor, dueño
- **Qué pasa:** Para el repositor no hay "+" ni nada para cargar un producto; buscar un código nuevo dice "No encontramos productos" sin ofrecer crearlo. Para el dueño solo hay un "+" sin texto. Modo carga, Conteos, Movimientos, Vencimientos y Cambio masivo no se llegan desde el celular.
- **Cómo debería ser:** § Productos 3: "Modo carga: pistola en la Mac o cámara en el iPhone"; § Requisitos transversales, dispositivos: el iPhone del dueño carga productos con la cámara; docs/design 04 Productos (393 px).
- **Capturas:** `qa/ronda-1/literal/02-productos-sin-modo-carga.png` · `qa/ronda-1/literal/07-buscar-sin-crear.png` · `qa/ronda-1/literal/11-productos-dueno-mas.png`

### Q22 · No hay forma de hacer un conteo en el iPhone, ni con la función prendida

- **Gravedad:** bloquea · **Estado:** sigue (ronda 2: literal P04 bloquea)
- **Quiénes:** literal (P05 bloquea) · auditoría: U05
- **Pantalla:** Productos · Inicio · Más · **Tamaño:** iPhone · **Rol:** repositor, dueño
- **Qué pasa:** Con "Conteos de inventario" prendido en Ajustes › Funciones, ninguna pantalla del celular lleva a Conteos. La única palabra "Conteo" es un filtro en Movimientos de stock.
- **Cómo debería ser:** § Productos 9: "En celular, modo conteo: escáner, teclado de cantidad…"; § Inicio, repositor: "Tus tareas: conteos asignados".
- **Capturas:** `qa/ronda-1/literal/25-conteos-prendido.png` · `qa/ronda-1/literal/26-productos-final-sin-conteo.png`

### Q23 · Enter sobre "Tarjeta" enfocado cobra toda la venta en efectivo; no hay forma dicha de elegir el medio con teclado

- **Gravedad:** bloquea · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** apurado (P02 bloquea · P03 confunde)
- **Pantalla:** Vender › Cobro · **Tamaño:** Mac · **Rol:** cajero
- **Qué pasa:** Con Tab se llega a Tarjeta (quinto Tab, después de Imprimir, Compartir y Sin ticket) y Enter confirma el cobro entero como efectivo: $ 2.500 del posnet quedaron como cash. Solo Espacio elige el medio. Ni la pantalla ni F1 dicen cómo elegir Efectivo / Tarjeta / QR / Fiado con el teclado.
- **Cómo debería ser:** § Vender, Cobro: cuatro botones y pago combinado; § Navegación, atajos: F1 lista completa. Enter en un botón enfocado tiene que activar ese botón; una tecla por medio (por ejemplo 1-4) en la franja.
- **Capturas:** `qa/ronda-1/apurado/03-tab-en-cobro-buscando-tarjeta.png` · `qa/ronda-1/apurado/pasos/023-23-v6-tarjeta-enter.png`

### Q24 · "Vender como varios · F3" dentro del diálogo de código no cargado: F3 no hace nada

- **Gravedad:** bloquea · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** apurado (P06 bloquea) · auditoría: U59
- **Pantalla:** Vender › El código no está cargado · **Tamaño:** Mac · **Rol:** cajero
- **Qué pasa:** Con la hoja abierta el manejador de atajos se desactiva: F3 no responde y el foco queda en Nombre. El cajero abandona.
- **Cómo debería ser:** § Vender: código desconocido con dos salidas; el botón promete F3, tiene que cumplirlo.
- **Capturas:** `qa/ronda-1/apurado/05-f3-no-hace-nada-en-dialogo-codigo-no-cargado.png`

### Q25 · Tipear "2*" sobre la pantalla verde pierde el 2: la venta sale con una unidad

- **Gravedad:** bloquea · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** apurado (P09 bloquea)
- **Pantalla:** Vender › Venta lista · **Tamaño:** Mac · **Rol:** cajero
- **Qué pasa:** La pistola sobre la pantalla verde entra directo, pero el teclado no: el "2" se gasta como "cualquier tecla", el "*" queda en la nada y la yerba entra ×1. El cliente se lleva dos.
- **Cómo debería ser:** § Vender, Venta lista: vuelve sola "o antes con cualquier tecla": la tecla que cierra la pantalla tiene que llegar también a la venta nueva (como pasa con la pistola).
- **Capturas:** `qa/ronda-1/apurado/09-venta-14-salio-con-1-yerba-el-2-se-perdio.png`

### Q26 · El cajero queda encerrado en Vender: "Salir del modo mostrador" e "Ir a Inicio" no hacen nada y no hay camino a Caja ni al cierre

- **Gravedad:** bloquea · **Estado:** sigue (ronda 2: apurado P08 confunde · desconfiado P06 confunde)
- **Quiénes:** apurado (P12 bloquea · P13 bloquea · P14 confunde)
- **Pantalla:** Vender (modo mostrador) › barra superior · menú de usuario · **Tamaño:** Mac · **Rol:** cajero
- **Qué pasa:** Enter y Espacio sobre esos botones no hacen nada (Enter además manda el foco a la nada); con el mouse tampoco: Inicio redirige al cajero a Vender (DECISIONS T42). "Caja abierta · …" es texto, y el menú del usuario solo tiene Cambiar de usuario y Salir. Para cerrar el turno hubo que escribir /caja en la barra del navegador.
- **Cómo debería ser:** § Navegación, modo mostrador; § Caja: el cajero abre y cierra su turno. Desde Vender tiene que haber "Caja" (o que el chip de caja abra Caja), y el cajero salir del modo mostrador a Caja en vez de a Inicio.
- **Capturas:** `qa/ronda-1/apurado/11-enter-en-botones-de-vender-no-hace-nada.png` · `qa/ronda-1/apurado/13-salir-del-modo-mostrador-muerto-con-mouse.png` · `qa/ronda-1/apurado/10-menu-usuario-sin-cerrar-caja.png`

### Q27 · La pantalla da por hecho lo que el servidor rechaza después: caja fantasma con fondo negativo, ventas con ticket que desaparecen y cierre que deja dos turnos abiertos

- **Gravedad:** bloquea · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** destructor (P01 bloquea · P02 bloquea · P06 bloquea)
- **Pantalla:** Caja › Abrir turno · Vender › Cobro · Caja › Arqueo y cierre · **Tamaño:** Mac · **Rol:** dueño, cajero
- **Qué pasa:** Las operaciones van a la cola sin validarse con el mismo esquema que el servidor. Fondo "−500": el header dice "Caja abierta", el servidor nunca la creó, Caja muestra "No pudimos cargar esto · Revisá la conexión" estando en línea, el cierre queda apagado para siempre y solo borrando el almacenamiento se sale. Venta con descuento −50 % o descripción de 5000 caracteres: "Listo" con ticket, el servidor la rechaza ("payload.discountCents: Too small") y desaparece del historial y de la caja; consume numeración. Cierre con nota de 5000 caracteres: imprime el comprobante y dice "Caja cerrada", el servidor lo rechaza, y al reabrir quedan dos turnos abiertos. El único rastro es un aviso técnico en Avisos.
- **Cómo debería ser:** § Ventas sin conexión: lo rechazado va a Avisos, pero antes la app tiene que validar con los esquemas de packages/shared (los mismos del servidor) y, si igual se rechaza, deshacer el estado local y decirlo en la pantalla. § Caja: un solo turno abierto por caja.
- **Capturas:** `qa/ronda-1/destructor/mac/01-caja-abierta-con-fondo-negativo-404.png` · `qa/ronda-1/destructor/mac/02-venta-rechazada-turno-no-existe.png` · `qa/ronda-1/destructor/mac/31-caja-cerrada-en-ui-abierta-en-servidor.png`

### Q28 · Doble clic en Ajustar stock y en Confirmar recepción duplica el stock

- **Gravedad:** bloquea · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** destructor (P03 bloquea)
- **Pantalla:** Productos › Ajustar stock · Compras › Recepción · **Tamaño:** Mac · **Rol:** dueño, repositor
- **Qué pasa:** Ajuste "Entra 10" con doble clic: 0 → 20. Recepción del 0041 con doble clic: aceite 8 → 32, Coca 12 → 44, fideos 22 → 62; el pedido queda "Recibido" una sola vez, así que nadie se entera.
- **Cómo debería ser:** § Ventas sin conexión: idempotencia por op_id (una operación por gesto); el botón se deshabilita al primer clic.
- **Capturas:** `qa/ronda-1/destructor/mac/17-ajuste-stock-doble-clic.png` · `qa/ronda-1/destructor/mac/23-recepcion-duplicada-stock.png`

### Q29 · Doble clic en Guardar crea dos proveedores, dos usuarios, dos clientes, dos borradores de pedido y dos conteos

- **Gravedad:** bloquea · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** destructor (P07 bloquea)
- **Pantalla:** Compras › Proveedores · Ajustes › Usuarios · Clientes › Nuevo · Sugerido › Guardar borrador · Productos › Conteos · Ajustes (Negocio, Medios, Tickets, Precios) · **Tamaño:** ambos · **Rol:** dueño
- **Qué pasa:** Cada doble clic manda dos POST (o dos PUT/PATCH en Ajustes). Donde sí funcionó: Cobrar, Abrir turno, Cambio masivo e Importar (una vez, pero el segundo da 500).
- **Cómo debería ser:** § Sistema de diseño: el botón primario pasa a "Guardando…" y se deshabilita hasta la respuesta.
- **Capturas:** `qa/ronda-1/destructor/mac/20-proveedor-guardado.png` · `qa/ronda-1/destructor/iphone/09-invitar-usuario-basura.png`

### Q30 · Cobrar fiado sin tope y duplicado por doble toque: Rosa "pagó" $ 1.999.999.998 por $ 18.400

- **Gravedad:** bloquea · **Estado:** sigue (ronda 2: destructor P21 confunde)
- **Quiénes:** destructor (P04 bloquea)
- **Pantalla:** Clientes y fiado › Cobrar fiado · **Tamaño:** iPhone · **Rol:** dueño
- **Qué pasa:** Con "Queda debiendo −$ 999.981.599" el botón sigue habilitado; el doble toque registra dos pagos y la caja suma "Cobros de fiado + $ 1.999.999.998".
- **Cómo debería ser:** § Clientes y fiado: cobro que cancela lo más viejo; no más que la deuda (o aviso de saldo a favor explícito) y una operación por toque.
- **Capturas:** `qa/ronda-1/destructor/iphone/05-cobro-fiado-mas-que-deuda.png` · `qa/ronda-1/destructor/iphone/06-cobro-fiado-duplicado-saldo-a-favor.png`

### Q31 · Anular un cobro de fiado no devuelve la plata de la caja; el cierre pide explicar el faltante

- **Gravedad:** bloquea · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** destructor (P05 bloquea)
- **Pantalla:** Clientes y fiado › Ficha › Anular · Caja · **Tamaño:** iPhone · **Rol:** dueño
- **Qué pasa:** La cuenta corriente vuelve a $ 18.400 pero Caja sigue con el cobro; el cierre dice "Faltan $ 1.999.999.998". Anular un pago no pide confirmación y el segundo toque da 400 sin mensaje.
- **Cómo debería ser:** § Caja: libro de movimientos: anular un cobro en efectivo genera el contramovimiento en la caja; DECISIONS T40.
- **Capturas:** `qa/ronda-1/destructor/iphone/07-caja-no-revierte-anulacion-fiado.png`

### Q32 · El mismo producto dos veces seguidas con la cámara no suma la segunda unidad

- **Gravedad:** confunde · **Estado:** sigue (ronda 2: celular P01 bloquea)
- **Quiénes:** celular (P03 confunde) · auditoría: C07
- **Pantalla:** Vender › Cámara · **Tamaño:** iPhone · **Rol:** todos los que venden
- **Qué pasa:** Sacar el producto del cuadro y volver a mostrarlo a los 3 s no suma: la ventana del filtro de repetidos es deslizante de 1,5 s y se renueva con cada lectura. Solo con más de 5 s de pausa entra la segunda unidad, y nada avisa.
- **Cómo debería ser:** § Vender, "Escanear dos veces el mismo producto suma cantidad". Ventana fija desde la primera aceptación y aviso "Yerba 1 kg × 2".
- **Capturas:** `qa/ronda-1/celular/pasos/011-11-aceite-x2.png`

### Q33 · "17 productos debajo del mínimo › Armar pedidos" muestra 3, y Distribuidora Andina no aparece en el sugerido

- **Gravedad:** confunde · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** celular (P12 confunde)
- **Pantalla:** Inicio › Armar pedidos · Compras › Sugerido · Proveedores › Ficha · **Tamaño:** iPhone · **Rol:** dueño
- **Qué pasa:** El sugerido lista solo Fiambres Don Luis · 1, Limpieza Cuyo · 1 y Mayorista Central · 1. Andina (que tiene la yerba en 2) no está, seguramente porque ya tiene el 0041 enviado, pero nadie lo dice; y desde su ficha no hay "Armar pedido".
- **Cómo debería ser:** § Compras 2: por proveedor, los productos debajo del mínimo; § Inicio: "12 productos debajo del mínimo → Armar pedidos". Mostrar al proveedor con "Ya pedido en el 0041" en vez de omitirlo.
- **Capturas:** `qa/ronda-1/celular/33-armar-pedidos-17-vs-3.png` · `qa/ronda-1/celular/31-ficha-andina-arriba.png`

### Q34 · Movimientos de stock (donde se aprueban los ajustes) solo se llega desde Inicio y no tiene Volver

- **Gravedad:** confunde · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** literal (P28 confunde) · auditoría: U05
- **Pantalla:** Productos › Movimientos de stock · **Tamaño:** iPhone · **Rol:** dueño
- **Qué pasa:** Desde Productos nada lleva ahí; se entra por "1 ajuste de stock para aprobar · Revisar". La barra dice "Productos", el título "Movimientos de stock", sin volver.
- **Cómo debería ser:** § Productos 7 y 8; § Navegación: los detalles a pantalla completa con vuelta.
- **Capturas:** `qa/ronda-1/literal/27-movimientos-para-aprobar.png`

### Q35 · La ficha rápida al escanear ofrece "Vender" como botón principal a un repositor

- **Gravedad:** confunde · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** literal (P10 confunde) · auditoría: U15
- **Pantalla:** Escanear (barra superior) › Ficha rápida · **Tamaño:** ambos · **Rol:** repositor
- **Qué pasa:** Vender / Ajustar / Al pedido se muestran a todos los roles; el repositor que toca Vender cae en "No tenés permiso". Tampoco hay forma de abrir la ficha completa desde ahí.
- **Cómo debería ser:** § Navegación: ficha rápida con "precio, stock y botones Vender, Ajustar y Agregar al pedido"; § Usuarios y permisos: la UI oculta lo que el rol no puede.
- **Capturas:** `qa/ronda-1/literal/05-popup-coca-desde-camara.png`

### Q36 · Elegí "Rotura" y en la ficha aparece "Merma · breakage"; la nota no se ve

- **Gravedad:** confunde · **Estado:** sigue (ronda 2: literal P08 confunde)
- **Quiénes:** literal (P07 confunde)
- **Pantalla:** Productos › Ficha › Stock › Movimientos · **Tamaño:** iPhone · **Rol:** repositor
- **Qué pasa:** El movimiento pendiente dice "Merma · para aprobar · breakage −2". En Movimientos de stock del dueño sí dice "Rotura". La nota del ajuste no aparece en la ficha.
- **Cómo debería ser:** § Productos 7 y 8: motivo en español (merma, rotura, vencido…) y nota; CLAUDE.md: UI en español.
- **Capturas:** `qa/ronda-1/literal/10-movimiento-merma-breakage.png`

### Q37 · "Nuevo producto" en el iPhone no tiene cámara para el código de barras

- **Gravedad:** confunde · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** literal (P13 confunde)
- **Pantalla:** Productos › Nuevo producto › Códigos de barras · **Tamaño:** iPhone · **Rol:** dueño
- **Qué pasa:** Solo un campo de texto: hay que tipear 13 dígitos por producto.
- **Cómo debería ser:** § Productos 3: alta con la cámara en el iPhone; § Navegación: Escanear actúa según dónde estés.
- **Capturas:** `qa/ronda-1/literal/12-nuevo-producto-campos-grises.png`

### Q38 · Guardar un producto nuevo no confirma nada y el producto queda perdido en la lista

- **Gravedad:** confunde · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** literal (P14 confunde)
- **Pantalla:** Productos › Nuevo producto › Guardar · **Tamaño:** iPhone · **Rol:** dueño
- **Qué pasa:** La hoja se cierra y la lista se ve igual (ordenada por nombre); solo cambia "Buscar en 27 productos". Al encontrarlo dice "Sin stock · Sin costo · Completar ficha". Lo mismo al aprobar un ajuste en Movimientos: la tarjeta desaparece y nada más.
- **Cómo debería ser:** § Sistema de diseño: toast de confirmación con acción ("Guardado: Galletitas · Ver"); § Requisitos transversales: nunca en silencio.
- **Capturas:** `qa/ronda-1/literal/13-nuevo-sin-confirmacion.png` · `qa/ronda-1/literal/pasos/059-59-aprobar.png`

### Q39 · "Lotes y vencimientos" está apagado, pero Inicio habla de "1 lote" y Recepción muestra "Lote y vencimiento"

- **Gravedad:** confunde · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** literal (P23 confunde)
- **Pantalla:** Inicio (repositor) · Compras › Recepción · Ajustes › Funciones · **Tamaño:** iPhone · **Rol:** repositor, dueño
- **Qué pasa:** La única tarea del repositor es "Revisar vencimientos · 1 lote vence en 7 días" y cada línea recibida tiene un botón "Lote y vencimiento", con la función apagada.
- **Cómo debería ser:** § Ajustes › Funciones (modo simple): lo apagado no aparece; DECISIONS T34.
- **Capturas:** `qa/ronda-1/literal/01-inicio-tareas.png` · `qa/ronda-1/literal/24-funciones-conteos-apagado.png`

### Q40 · Inicio dice "Requiere atención · 4" pero la campana dice "No hay avisos"

- **Gravedad:** confunde · **Estado:** sigue (ronda 2: celular P05 confunde)
- **Quiénes:** celular (P05 confunde)
- **Pantalla:** Inicio › Avisos · **Tamaño:** iPhone · **Rol:** dueño
- **Qué pasa:** Los 4 temas del panel (stock bajo, vencimiento, factura, fiado vencido) no están en la campana: no se pueden marcar leídos ni posponer. "Requiere atención" se calcula en vivo y los avisos salen de eventos (DECISIONS T41/T42), pero el usuario espera lo mismo en los dos lados.
- **Cómo debería ser:** § Inicio, Avisos: "Cada aviso lleva a su pantalla y se puede posponer o dar por resuelto"; § Requisitos transversales, tipos de aviso.
- **Capturas:** `qa/ronda-1/celular/02-avisos-vacios-pero-inicio-dice-4.png`

### Q41 · Sin internet, después de cobrar desaparece "Sin conexión" y nada dice que hay una venta por sincronizar

- **Gravedad:** confunde · **Estado:** sigue (ronda 2: celular P09 molesta)
- **Quiénes:** celular (P07 confunde)
- **Pantalla:** Vender (barra superior) · **Tamaño:** iPhone · **Rol:** dueño
- **Qué pasa:** Antes de cobrar el chip naranja y el cartel "Sin internet: podés seguir vendiendo" están bien. Después de "Listo", el chip vuelve a "Caja abierta" en verde aunque sigue sin red, sin contador de pendientes; al reconectar tampoco aparece "Todo sincronizado".
- **Cómo debería ser:** § Requisitos transversales: chip "Sin conexión · 3 ventas por sincronizar" y al volver "Todo sincronizado"; § Vender, Estados.
- **Capturas:** `qa/ronda-1/celular/14-offline-pero-chip-dice-caja-abierta.png` · `qa/ronda-1/celular/15-reconectado-1s.png`

### Q42 · "Sin stock según el sistema. ¿Vender igual?" no tiene tecla y F12 cobra sin contestar; en el iPhone no tiene botones

- **Gravedad:** confunde · **Estado:** sigue (ronda 2: apurado P11 confunde)
- **Quiénes:** apurado (P05 confunde) · auditoría: U57
- **Pantalla:** Vender › Venta › línea sin stock · **Tamaño:** ambos · **Rol:** todos los que venden
- **Qué pasa:** La franja roja muestra "Vender igual" y "Quitar" sin atajo; F12 cobra igual. En el iPhone el aviso es solo texto.
- **Cómo debería ser:** § Vender: "aviso que no bloquea… En Ajustes se puede exigir PIN". Que la pregunta se pueda contestar (teclas) y que en el celular tenga botones.
- **Capturas:** `qa/ronda-1/apurado/pasos/028-28-v8-leche.png`

### Q43 · QR exige tildar "Verificada en el banco" y no dice cómo con el teclado

- **Gravedad:** confunde · **Estado:** sigue (ronda 2: apurado P06 confunde)
- **Quiénes:** apurado (P11 confunde)
- **Pantalla:** Vender › Cobro › Transferencia o QR · **Tamaño:** Mac · **Rol:** cajero
- **Qué pasa:** Ctrl+Enter no cobra hasta tildar; el tilde está varios Tab más allá y se marca con Espacio. Se descubre a prueba y error.
- **Cómo debería ser:** § Vender, Cobro, Transferencia o QR: pide tildar; con una tecla visible (por ejemplo "V").
- **Capturas:** `qa/ronda-1/apurado/07-cobro-qr-no-entra-en-pantalla.png`

### Q44 · Textos de teclado en el iPhone: "Cualquier tecla para la próxima venta", "Ctrl ⏎", "Esc"

- **Gravedad:** confunde · **Estado:** sigue (ronda 2: celular P11 molesta)
- **Quiénes:** celular (P16 molesta) · auditoría: U58, U107
- **Pantalla:** Vender › Venta lista · Cobro · Teclado de peso · **Tamaño:** iPhone · **Rol:** todos los que venden
- **Qué pasa:** La pantalla verde manda a buscar un teclado; el cobro dice "Ctrl ⏎"; el peso "Esc" y "⏎". En el celular faltan "Nueva venta" / "Compartir PDF" / "Sin ticket".
- **Cómo debería ser:** § Vender, Venta lista y Cobro (hoja en celular); docs/design 02 Vender (iPhone).
- **Capturas:** `qa/ronda-1/celular/12-tras-confirmar-offline.png`

### Q45 · Los botones de efectivo rápido reemplazan en vez de sumar

- **Gravedad:** confunde · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** desconfiado (P10 confunde)
- **Pantalla:** Vender › Cobro › Efectivo · **Tamaño:** Mac · **Rol:** todos los que venden
- **Qué pasa:** Un billete de 20.000 y uno de 10.000: tocar "$ 20.000" y "$ 10.000" deja Recibido $ 10.000. Hay que tipear 30000.
- **Cómo debería ser:** § Vender, Cobro: "billetes rápidos ($ 1.000, $ 2.000, $ 10.000, $ 20.000, Justo)": son billetes que el cliente entrega, suman.
- **Capturas:** `qa/ronda-1/desconfiado/08-botones-rapidos-no-suman.png`

### Q46 · Con crédito el total es $ 14.630 pero "Monto con crédito" y "Falta" dicen $ 13.300

- **Gravedad:** confunde · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** desconfiado (P11 confunde)
- **Pantalla:** Vender › Cobro › Tarjeta › Crédito · **Tamaño:** Mac · **Rol:** todos los que venden
- **Qué pasa:** Arriba "$ 14.630 · Incluye recargo $ 1.330" (bien); el recuadro grande del medio dice "Monto con crédito $ 13.300" y "Falta $ 13.300". Quien le pasa ese número al posnet cobra $ 1.330 de menos. La venta se registró bien.
- **Cómo debería ser:** § Vender, Cobro: "Recargos… se muestran como línea antes de confirmar"; el monto a cobrar en el posnet tiene que ser el total con recargo.
- **Capturas:** `qa/ronda-1/desconfiado/09-credito-monto-sin-recargo.png`

### Q47 · Fiado sin cliente: "Asigná un cliente con F5", pero F5 no funciona dentro del cobro

- **Gravedad:** confunde · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** desconfiado (P12 confunde)
- **Pantalla:** Vender › Cobro › Fiado · **Tamaño:** Mac · **Rol:** todos los que venden
- **Qué pasa:** Hay que cerrar el cobro, F5, elegir, F12 y Fiado de nuevo. El mensaje aparece dos veces y manda a una tecla muerta.
- **Cómo debería ser:** § Vender, Cobro, Fiado: muestra saldo, límite y saldo después; elegir cliente desde ahí.
- **Capturas:** `qa/ronda-1/desconfiado/10-fiado-f5-no-anda-en-cobro.png`

### Q48 · En Reportes las categorías y los productos suman $ 48.850 contra un total de $ 50.180: el recargo no figura en ningún renglón

- **Gravedad:** confunde · **Estado:** sigue (ronda 2: desconfiado P10 molesta)
- **Quiénes:** desconfiado (P13 confunde)
- **Pantalla:** Reportes › Ventas · Inicio › Margen · **Tamaño:** Mac · **Rol:** dueño
- **Qué pasa:** Los porcentajes por categoría suman 98 %. En Inicio "30 % de lo vendido" usa la base sin recargo.
- **Cómo debería ser:** § Reportes: las tablas tienen que cerrar con el total (línea "Recargos por medio de pago" o total sin recargo aclarado).
- **Capturas:** `qa/ronda-1/desconfiado/11-reportes-categorias-no-suman-el-total.png`

### Q49 · "Cargá tus productos" promete Excel pero el único botón es "Modo carga"

- **Gravedad:** confunde · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** desconfiado (P01 confunde) · auditoría: U37
- **Pantalla:** Inicio › Primeros pasos · **Tamaño:** Mac · **Rol:** dueño
- **Qué pasa:** El paso dice "Con Excel, escaneando en Modo carga o directamente vendiendo"; el botón abre la pistola. Importar está en Productos.
- **Cómo debería ser:** § Inicio, Primeros pasos: "cargá tus productos (Excel o escaneando)"; § Productos, Estados: catálogo vacío con tres caminos.
- **Capturas:** `qa/ronda-1/desconfiado/01-modo-carga-no-es-excel.png`

### Q50 · La vista previa de la importación no muestra precios ni stock

- **Gravedad:** confunde · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** desconfiado (P02 confunde)
- **Pantalla:** Productos › Importar › Vista previa · **Tamaño:** Mac · **Rol:** dueño
- **Qué pasa:** "Fila 2 · Coca-Cola 2,25 L" y nada más: se importa a ciegas y se controla después.
- **Cómo debería ser:** § Productos 4: "vista previa (nuevos, actualizados, con error)" con los datos leídos.
- **Capturas:** `qa/ronda-1/desconfiado/02-vista-previa-sin-precios.png`

### Q51 · Al importar, los pesables quedan "Por unidad" con stock 4,5 sin aviso

- **Gravedad:** confunde · **Estado:** sigue (ronda 2: desconfiado P05 confunde)
- **Quiénes:** desconfiado (P03 confunde)
- **Pantalla:** Productos › Importar · Ficha · **Tamaño:** Mac · **Rol:** dueño
- **Qué pasa:** Sin columna de unidad, "Jamón cocido x kg" queda por unidad con 4,5 unidades. Nada pregunta ni marca.
- **Cómo debería ser:** § Productos 4: vista previa con error o aviso; detectar "kg" en el nombre o stock con decimales y preguntar.
- **Capturas:** `qa/ronda-1/desconfiado/03-jamon-por-unidad-stock-4-5.png`

### Q52 · La prueba de la pistola abre la ficha rápida del producto encima del botón "Habilitar este dispositivo"

- **Gravedad:** confunde · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** desconfiado (P05 confunde)
- **Pantalla:** Ajustes › Dispositivos › Prueba de la pistola · **Tamaño:** Mac · **Rol:** dueño
- **Qué pasa:** El código aparece abajo (bien) pero salta "Coca-Cola 2,25 L · Vender / Ajustar / Al pedido".
- **Cómo debería ser:** § Ajustes › Dispositivos: prueba de la pistola; durante la prueba el escáner global no actúa.
- **Capturas:** `qa/ronda-1/desconfiado/05-prueba-pistola-abre-popup-producto.png`

### Q53 · En la cuenta corriente del cliente se pisan concepto y monto, y "Anular" queda pegado a cada fila

- **Gravedad:** confunde · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** celular (P19 molesta) · auditoría: U77
- **Pantalla:** Clientes y fiado › Ficha · **Tamaño:** iPhone · **Rol:** dueño
- **Qué pasa:** "Compra fiada" se superpone con "$ 10.000"; "queda $ 8.400" se parte en tres líneas; "Anular" (rojo, chico, sin confirmación) al lado de cada monto.
- **Cómo debería ser:** § Clientes y fiado: ficha y cuenta corriente legible; docs/design 06 Clientes (393 px); anular con confirmación.
- **Capturas:** `qa/ronda-1/celular/pasos/045-45-clientes.png` · `qa/ronda-1/celular/pasos/047-47-10000.png`

### Q54 · Palabras técnicas o en inglés que una repositora nueva no entiende

- **Gravedad:** confunde · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** literal (lista de 24) · auditoría: U12, U105
- **Pantalla:** Varias · **Tamaño:** iPhone · **Rol:** repositor
- **Qué pasa:** breakage, sent, PLU, YPL-1K, Pack × 8, Merma, Stock real, Negativo, Inactivos, lote, u ("Faltan 2 u"), Confirm., remito, Borrador, Sugerido, PDF, CUIT/CVU/QR/push, conteo ciego, Ticket promedio, Margen estimado. Y en Ajustes › Actividad, tipos internos ("product", "customer_ledger").
- **Cómo debería ser:** CLAUDE.md: español rioplatense; § Sistema de diseño: lenguaje del mostrador. Las de inglés se traducen; las técnicas llevan ayuda al lado.
- **Capturas:** `qa/ronda-1/literal/10-movimiento-merma-breakage.png` · `qa/ronda-1/literal/pasos/046-46-confirmar-recepcion.png`

### Q55 · Íconos sin texto: campana, código de barras, "+", flecha de volver, checks de colores, "→ …"

- **Gravedad:** confunde · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** literal (lista de 13)
- **Pantalla:** Barra superior · Productos · Recepción · **Tamaño:** iPhone · **Rol:** todos
- **Qué pasa:** El de código de barras no dice para qué escanea; el "+" es "Nuevo producto"; en Recepción los círculos ✓ verde/marrón y el "6 → …" no se explican.
- **Cómo debería ser:** § Sistema de diseño: botones que dicen qué hacen; docs/design (barra superior con rótulos).
- **Capturas:** `qa/ronda-1/literal/01-inicio-tareas.png` · `qa/ronda-1/literal/19-recepcion-arriba.png`

### Q56 · La misma cosa con nombres distintos entre pantallas

- **Gravedad:** confunde · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** literal (lista de 13) · auditoría: U89, U76, U116, U135, U24
- **Pantalla:** Varias · **Tamaño:** ambos · **Rol:** todos
- **Qué pasa:** Ajustar / Ajustar stock; Rotura / Merma / breakage; Escanear / Apuntá al código / Cámara; Recibir / Recibir mercadería / Confirmar recepción; Conteos de inventario / Conteo; Lote y vencimiento / Lotes y vencimientos / Vencimientos / Por vencer; Enviar para aprobar / para aprobar / Ajustes para aprobar; Sumar al pedido / Al pedido / Agregar al pedido; Compra en persona / Compra en mayorista / Mayorista; Descargar PDF / PDF / PDF para adjuntar.
- **Cómo debería ser:** § Sistema de diseño: un nombre por cosa (el del spec).
- **Capturas:** `qa/ronda-1/literal/pasos/036-36-recepcion.png`

### Q57 · Dos pestañas en la misma caja: dos ventas con el número 000003

- **Gravedad:** confunde · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** destructor (P08 confunde)
- **Pantalla:** Vender › Historial · **Tamaño:** Mac · **Rol:** dueño
- **Qué pasa:** Cobrar en dos pestañas casi a la vez da el mismo número; stock y caja bien.
- **Cómo debería ser:** DECISIONS T24: numeración por caja en la copia local; tiene que ser atómica entre pestañas (o el servidor renumera).
- **Capturas:** `qa/ronda-1/destructor/mac/07-dos-ventas-numero-000003.png`

### Q58 · Descuento negativo se aplica como recargo y 150 % deja el total en $ 0 sin avisar

- **Gravedad:** confunde · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** destructor (P09 confunde)
- **Pantalla:** Vender › Descuento (F4) · **Tamaño:** Mac · **Rol:** todos los que venden
- **Qué pasa:** "-50%" muestra "Descuento −−$ 2.300" y Total $ 6.900 sobre $ 4.600 (el servidor la rechaza después); "150%", "99999999", emoji o espacios dejan $ 0 y se pueden aplicar.
- **Cómo debería ser:** § Vender: descuento acotado entre 0 y el total, con mensaje.
- **Capturas:** `qa/ronda-1/destructor/mac/09-descuento-negativo.png`

### Q59 · Retiro mayor que el efectivo aceptado; el diálogo dice "queda $ 0" con $ 42.500 en el cajón; el motivo largo se rechaza en silencio

- **Gravedad:** confunde · **Estado:** sigue (ronda 2: destructor P23 confunde)
- **Quiénes:** destructor (P10 confunde) · auditoría: U63
- **Pantalla:** Vender › Retiro (F9) · Caja › Gasto · **Tamaño:** Mac · **Rol:** dueño, cajero
- **Qué pasa:** Desde Vender el pie dice "queda $ 0" (no conoce el esperado); "-500" suma; $ 99.999.999 deja la caja en −$ 99.957.499. Gasto con motivo de 5000 caracteres cierra el diálogo y el servidor lo rechaza después. "-1500" da "Poné el monto.".
- **Cómo debería ser:** § Caja, movimientos manuales con motivo; el retiro no puede superar el efectivo esperado sin PIN y el pie tiene que mostrar el esperado real.
- **Capturas:** `qa/ronda-1/destructor/mac/13-caja-tras-retiro-gigante.png`

### Q60 · "1000.50" vale 100.050 en todos los campos de plata y de cantidad

- **Gravedad:** confunde · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** destructor (P11 confunde · P29 molesta)
- **Pantalla:** Todos los campos de plata y cantidad (apertura, descuento, Varios, retiro, precio, costo, recibido, pedir, ajuste) · **Tamaño:** ambos · **Rol:** todos
- **Qué pasa:** "1.000,50" y "1000,5" se leen bien; "1000.50" se vuelve $ 100.050 (quedó un producto a ese precio y un costo). En cantidades "-5" pierde el signo. El ajuste de stock acepta 99.999.999 y "1000.50" pero apaga el botón con "1.000,50" sin decir por qué.
- **Cómo debería ser:** CLAUDE.md: formatos argentinos; un solo analizador de números para toda la app (punto como miles solo si siguen 3 dígitos; si no, decimal) con tope razonable.
- **Capturas:** `qa/ronda-1/destructor/mac/pasos/065-61-producto-409.png` · `qa/ronda-1/destructor/mac/21-recepcion-cantidad-gigante.png`

### Q61 · Errores de validación genéricos, en inglés y sin decir qué campo

- **Gravedad:** confunde · **Estado:** sigue (ronda 2: destructor P09 confunde · destructor P13 confunde)
- **Quiénes:** destructor (P12 confunde)
- **Pantalla:** Productos › Nuevo/Editar · Proveedores › Nuevo · Ajustes (Negocio, Medios, Tickets, Precios) · Conteos › Nuevo · Cambio masivo · **Tamaño:** ambos · **Rol:** dueño
- **Qué pasa:** "Revisá los datos: hay campos con errores." sin marcar ninguno; o el texto crudo de Zod: "Too big: expected string to have <=60 characters", "Invalid email address", uno por vez.
- **Cómo debería ser:** § Sistema de diseño, campos con estado de error; § Requisitos transversales: lo que falla explica por qué. Mensajes en español y junto al campo (mapa de errores de Zod → campo).
- **Capturas:** `qa/ronda-1/destructor/mac/15-producto-error-generico.png` · `qa/ronda-1/destructor/mac/19-proveedor-basura.png`

### Q62 · Cliente (o producto, o ajuste) "guardado" que el servidor rechaza: la app manda a una ficha que dice "La ficha se ve con conexión" estando en línea

- **Gravedad:** confunde · **Estado:** sigue (ronda 2: desconfiado P12 molesta · destructor P20 confunde)
- **Quiénes:** destructor (P14 confunde) · auditoría: U30, U08
- **Pantalla:** Clientes › Nuevo cliente · Productos › Nuevo · Ajustar stock · **Tamaño:** iPhone · **Rol:** dueño
- **Qué pasa:** Apodo de 5000 caracteres o límite −50.000: Guardar cierra y navega a /clientes/<id>, que no existe; el rechazo solo está en Avisos. Teléfono "-123abc🧀" se acepta.
- **Cómo debería ser:** Validar antes de encolar (esquemas compartidos); si falla, quedarse en el formulario con el error; ErrorState que distinga sin conexión de "no existe".
- **Capturas:** `qa/ronda-1/destructor/iphone/04-cliente-basura-iphone.png`

### Q63 · Invitar usuario acepta el PIN del dueño y teléfono "abc"

- **Gravedad:** confunde · **Estado:** sigue (ronda 2: destructor P14 confunde)
- **Quiénes:** destructor (P15 confunde)
- **Pantalla:** Ajustes › Usuarios › Invitar · **Tamaño:** iPhone · **Rol:** dueño
- **Qué pasa:** Dos cajeros con el PIN 1234 de Carlos: en la pantalla de PIN cualquiera de los tres entra con el mismo número. "12" también habilita el botón.
- **Cómo debería ser:** § Usuarios y permisos: PIN de 4 a 6 dígitos, único por negocio (si no, el PIN no identifica a quien autoriza: DECISIONS T23).
- **Capturas:** `qa/ronda-1/destructor/iphone/09-invitar-usuario-basura.png`

### Q64 · Editar producto acepta precio $ 0 y stock mínimo 1,5 por unidad; costo negativo muestra "Con 40 % de ganancia: −$ 100"

- **Gravedad:** confunde · **Estado:** sigue (ronda 2: destructor P07 confunde · destructor P08 confunde · destructor P10 confunde)
- **Quiénes:** destructor (P16 confunde)
- **Pantalla:** Productos › Editar / Nuevo · **Tamaño:** Mac · **Rol:** dueño
- **Qué pasa:** Guardó precio 0 (ganancia −100 %), mínimo 1,5 y ubicación con script. En el alta, el costo negativo no se marca.
- **Cómo debería ser:** § Productos, ficha: precio > 0 (o aviso "regalás el producto"), mínimo entero para productos por unidad, costo ≥ 0.
- **Capturas:** `qa/ronda-1/destructor/mac/18-editar-producto-basura.png`

### Q65 · Ajustes dice "Guardado" aunque la API devolvió 400; la basura se vuelve 0 o se guarda vacía

- **Gravedad:** confunde · **Estado:** sigue (ronda 2: destructor P03 bloquea · destructor P04 bloquea · destructor P28 molesta)
- **Quiénes:** destructor (P17 confunde · P18 confunde) · auditoría: U09, U70
- **Pantalla:** Ajustes › Medios de pago · Cajas · Precios y stock · **Tamaño:** iPhone · **Rol:** dueño
- **Qué pasa:** Recargo "-500", comisión "abc🧀", CVU "-1": "Guardado" dos veces y un 400 en el medio; al recargar, ceros y CVU "1". Cajas: nombre con espacios queda vacío, tolerancia "abc" → 0, fondo "-5000" → 400 pero "Guardado". Billetes basura quedan "1, 50".
- **Cómo debería ser:** § Ajustes: cada sección valida y confirma lo que guardó; un solo modelo de guardado por sección.
- **Capturas:** `qa/ronda-1/destructor/iphone/10-medios-de-pago-basura.png` · `qa/ronda-1/destructor/iphone/11-cajas-basura-iphone.png`

### Q66 · Importar: con filas basura es un 400 sin decir qué fila; con un CSV limpio el doble toque muestra "Algo salió mal" y "Listo" a la vez

- **Gravedad:** confunde · **Estado:** sigue (ronda 2: destructor P27 molesta)
- **Quiénes:** destructor (P19 confunde)
- **Pantalla:** Productos › Importar · **Tamaño:** iPhone · **Rol:** dueño
- **Qué pasa:** La vista previa promete "Los errores se muestran con su fila" y devuelve "Revisá los datos" sin más. El segundo toque en "Importar" da 500 y conviven los dos mensajes.
- **Cómo debería ser:** § Productos 4: vista previa con "nuevos, actualizados, con error" por fila; confirmar idempotente.
- **Capturas:** `qa/ronda-1/destructor/iphone/12-importar-vista-previa.png` · `qa/ronda-1/destructor/iphone/13-importar-500-y-listo-a-la-vez.png`

### Q67 · Cambio masivo: "Revisá los datos" queda pegado junto a "Listo: cambiaron 1 precios"

- **Gravedad:** confunde · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** destructor (P20 confunde) · auditoría: U88
- **Pantalla:** Productos › Cambio masivo de precios · **Tamaño:** Mac · **Rol:** dueño
- **Qué pasa:** Después de un intento inválido (−150) el error no se borra cuando la vista previa sale bien; "abc", "99999" y espacios dejan el botón habilitado.
- **Cómo debería ser:** § Productos 5: vista previa → confirmar; errores que se van al corregir.
- **Capturas:** `qa/ronda-1/destructor/mac/25-cambio-precios-error-pegado.png`

### Q68 · Pedido sugerido acepta 99.999.999 unidades y "Guardar borrador" falla sin ningún mensaje

- **Gravedad:** confunde · **Estado:** sigue (ronda 2: destructor P11 confunde)
- **Quiénes:** destructor (P21 confunde) · auditoría: U07
- **Pantalla:** Compras › Sugerido › Guardar borrador · **Tamaño:** Mac · **Rol:** dueño
- **Qué pasa:** POST /api/orders → 400 y la pantalla no cambia. Lo mismo en Recepción con 99.999.999: "Confirmar recepción" no hace nada (ni request).
- **Cómo debería ser:** § Requisitos transversales: nunca falla en silencio; tope razonable en cantidades.
- **Capturas:** `qa/ronda-1/destructor/mac/27-guardar-borrador-400-sin-mensaje.png` · `qa/ronda-1/destructor/mac/22-recepcion-tras-confirmar.png`

### Q69 · Cierre: "Ver resultado" se apaga sin decir por qué, recargar borra lo contado, y atrás con el cobro abierto saca de Vender sin preguntar

- **Gravedad:** confunde · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** destructor (P22 confunde · P23 confunde) · auditoría: U13
- **Pantalla:** Caja › Arqueo y cierre · Vender › Cobro · **Tamaño:** Mac · **Rol:** dueño, cajero
- **Qué pasa:** Débito "-500" o crédito "🧀🍞" apagan el botón sin aviso; con todo contado, F5 vuelve al paso 1 en cero. Ir atrás con el diálogo de cobro abierto lleva a Caja (el carrito se conserva).
- **Cómo debería ser:** § Caja, arqueo: conteo que sobrevive una recarga (como la venta en curso, DECISIONS T24); campos con error visible.
- **Capturas:** `qa/ronda-1/destructor/mac/03-cierre-ver-resultado-apagado-sin-motivo.png` · `qa/ronda-1/destructor/mac/29-cierre-tras-recargar.png`

### Q70 · El cajero y el encargado pueden entrar por URL al cierre del turno abierto por otro

- **Gravedad:** confunde · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** destructor (P24 (parte))
- **Pantalla:** Caja › Arqueo y cierre · **Tamaño:** iPhone · **Rol:** cajero, encargado
- **Qué pasa:** /caja/cierre del turno de Carlos con "Ver resultado" habilitado para Tomás.
- **Cómo debería ser:** § Caja: el turno es de una persona; cerrar el de otro pide PIN o aviso.
- **Capturas:** `qa/ronda-1/destructor/iphone/15-cajero-cierre-turno-ajeno.png`

### Q71 · En Recepción la cámara se cierra después de cada lectura

- **Gravedad:** molesta · **Estado:** sigue (ronda 2: literal P07 confunde)
- **Quiénes:** literal (P21 molesta) · auditoría: C16
- **Pantalla:** Compras › Recepción · **Tamaño:** iPhone · **Rol:** dueño, repositor
- **Qué pasa:** Por cada producto: tocar "Cámara", mostrar, escribir cantidad, "Listo", y otra vez "Cámara". Lo mismo en Modo carga después de "Seguir cargando".
- **Cómo debería ser:** § Compras 5: "Se escanea cada producto y se tipea la cantidad" (en serie); reabrir la cámara sola al confirmar la cantidad.
- **Capturas:** `qa/ronda-1/literal/21-yogur-faltante-antes-listo.png`

### Q72 · Sin resultados, el buscador dice "Buscar en 0 productos"

- **Gravedad:** molesta · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** literal (P27 molesta) · auditoría: U86
- **Pantalla:** Productos › buscador · **Tamaño:** iPhone · **Rol:** todos
- **Qué pasa:** El placeholder cambia a "Buscar en 0 productos": parece que se borraron los productos. Y "No encontramos productos" no ofrece crearlo.
- **Cómo debería ser:** § Productos, Estados; § Sistema de diseño, vacíos con acción.
- **Capturas:** `qa/ronda-1/literal/07-buscar-sin-crear.png`

### Q73 · La entrada pregunta "¿Quién va a usar la caja?" también al repositor, y "Repositor" va en masculino

- **Gravedad:** molesta · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** literal (P09 molesta)
- **Pantalla:** Ingreso con PIN · **Tamaño:** iPhone · **Rol:** repositor
- **Qué pasa:** Una repositora duda si tocar su nombre porque no cobra.
- **Cómo debería ser:** § Usuarios y permisos: cambio rápido de usuario con PIN en cualquier dispositivo. "¿Quién sos?".
- **Capturas:** `qa/ronda-1/literal/pasos/001-01-entrar.png`

### Q74 · Con 3G, esperas de 4 a 9 s sin ningún indicador de carga

- **Gravedad:** molesta · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** celular (P18 molesta)
- **Pantalla:** Carga inicial · Entrar · Cobrar fiado · Reportes · Sugerido · **Tamaño:** iPhone · **Rol:** dueño
- **Qué pasa:** Carga inicial 9 s en blanco; "Entrar" gris 3,8 s; "Registrar pago" 5,2 s; Reportes 5,1 s; cambiar período 4,9 s; "Armar pedidos" 7 s. Uno toca de nuevo por las dudas.
- **Cómo debería ser:** § Inicio, Estados: "Cargando: esqueletos"; § Sistema de diseño, estados de carga en botones.
- **Capturas:** `qa/ronda-1/celular/01-login-esperando.png` · `qa/ronda-1/celular/38-reportes-1s.png`

### Q75 · La pantalla verde dice "efectivo" en una venta combinada

- **Gravedad:** molesta · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** apurado (P04 molesta)
- **Pantalla:** Vender › Venta lista · **Tamaño:** Mac · **Rol:** cajero
- **Qué pasa:** "Venta 000007 · $ 5.300 · efectivo" aunque $ 2.300 fueron con débito.
- **Cómo debería ser:** § Vender, Venta lista: "Venta 004187 · $ 18.550 · Vuelto $ 1.450"; con pago combinado, los medios.
- **Capturas:** `qa/ronda-1/apurado/pasos/027-27-v7-confirmar.png`

### Q76 · Escanear un código que no existe deja un 503 de /api/off/<código> en la consola

- **Gravedad:** molesta · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** apurado (P07 molesta)
- **Pantalla:** Vender › código desconocido · **Tamaño:** Mac · **Rol:** cajero
- **Qué pasa:** Con Open Food Facts apagado (OFF_DISABLED) la API responde 503 y el navegador lo loguea como error.
- **Cómo debería ser:** § Productos 3: OFF completa nombre y foto si está; apagado o caído, la app sigue en silencio (una respuesta 204 o {found:false}).
- **Capturas:** `qa/ronda-1/apurado/04-codigo-que-no-existe.png`

### Q77 · Enter agrega un pago parcial y Ctrl+Enter confirma, pero solo está escrito "Ctrl ⏎"

- **Gravedad:** molesta · **Estado:** sigue (ronda 2: apurado P04 confunde)
- **Quiénes:** apurado (P16 molesta)
- **Pantalla:** Vender › Cobro · **Tamaño:** Mac · **Rol:** cajero
- **Qué pasa:** Se descubre apretando Enter a ver qué pasa.
- **Cómo debería ser:** § Vender, Cobro: pago combinado; franja de atajos del cobro.
- **Capturas:** `qa/ronda-1/apurado/pasos/021-21-v6-combinado.png`

### Q78 · El teclado de peso no dice que se tipean gramos

- **Gravedad:** molesta · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** apurado (P17 molesta)
- **Pantalla:** Vender › Teclado de peso · **Tamaño:** Mac · **Rol:** cajero
- **Qué pasa:** "Peso que marca la balanza 0,000 kg": se tipea 350 a ciegas y sale 0,350 kg; con 1,250 kg no se sabe.
- **Cómo debería ser:** § Vender: "un teclado pide el peso que marca la balanza (235 = 0,235 kg)": mostrar esa pista.
- **Capturas:** `qa/ronda-1/apurado/pasos/014-14-v4-pan.png`

### Q79 · Para el cajero la ficha muestra una sección "Costo y precio" vacía

- **Gravedad:** molesta · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** desconfiado (P17 molesta)
- **Pantalla:** Productos › Ficha › Precio · **Tamaño:** Mac · **Rol:** cajero
- **Qué pasa:** Título y recuadro en blanco con una línea verde sin nada.
- **Cómo debería ser:** § Usuarios y permisos: la UI oculta lo que el rol no ve (sección entera).
- **Capturas:** `qa/ronda-1/desconfiado/17-cajera-ficha-precio.png`

### Q80 · Creo un cliente y la lista sigue diciendo "No hay clientes acá" (filtro "Con deuda")

- **Gravedad:** molesta · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** desconfiado (P04 molesta) · auditoría: U29
- **Pantalla:** Clientes y fiado · **Tamaño:** Mac · **Rol:** dueño
- **Qué pasa:** La ficha aparece a la derecha pero la lista queda vacía por el filtro por defecto.
- **Cómo debería ser:** § Clientes y fiado: lista y saldos; vacío con acción y filtro que no esconda al recién creado.
- **Capturas:** `qa/ronda-1/desconfiado/04-cliente-creado-pero-lista-vacia.png`

### Q81 · Al cambiar de módulo la página aparece scrolleada hasta donde estaba la anterior

- **Gravedad:** molesta · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** desconfiado (P06 molesta)
- **Pantalla:** Caja (y cualquier módulo) · **Tamaño:** Mac · **Rol:** todos
- **Qué pasa:** Venía de Ajustes con la página bajada y Caja abrió mostrando solo los billetes de $ 100 para abajo.
- **Cómo debería ser:** § Navegación: cada módulo arranca arriba.
- **Capturas:** `qa/ronda-1/desconfiado/06-caja-abre-scrolleada.png`

### Q82 · Al abrir el turno la consola registra un 404 en GET /api/shifts/<id>

- **Gravedad:** molesta · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** desconfiado (P07 molesta)
- **Pantalla:** Caja › Abrir turno · **Tamaño:** Mac · **Rol:** dueño
- **Qué pasa:** La pantalla queda bien, pero la app pide el turno antes de que exista en el servidor.
- **Cómo debería ser:** Consola limpia; esperar la respuesta de la apertura antes de leer el turno.
- **Capturas:** `qa/ronda-1/desconfiado/pasos/037-34-abrir-turno.png`

### Q83 · El recargo de crédito del 10 % viene puesto de fábrica sin avisar

- **Gravedad:** molesta · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** desconfiado (P14 molesta)
- **Pantalla:** Ajustes › Medios de pago · **Tamaño:** Mac · **Rol:** dueño
- **Qué pasa:** Crédito trae "Recargo 10 %" y comisión 1,8 %; débito 0,8 %. Un dueño que no entra a Ajustes le cobra un 10 % a un cliente sin saberlo.
- **Cómo debería ser:** § Inicio, Primeros pasos: "configurá medios de pago" (y que el paso lo diga).
- **Capturas:** `qa/ronda-1/desconfiado/pasos/033-30-credito.png`

### Q84 · "Cerrar turno y avisar al dueño" cuando el que cierra es el dueño

- **Gravedad:** molesta · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** desconfiado (P15 molesta) · auditoría: U117
- **Pantalla:** Caja › Arqueo y cierre · **Tamaño:** Mac · **Rol:** dueño
- **Qué pasa:** El dueño se queda pensando a quién le avisa.
- **Cómo debería ser:** § Caja, cierre: el dueño recibe la notificación; el botón según quién cierra.
- **Capturas:** `qa/ronda-1/desconfiado/pasos/065-62-contar.png`

### Q85 · Al abrir el segundo turno, con el contador en $ 0 ya dice "No coincide con lo que dejó Raúl ($ 15.000)"

- **Gravedad:** molesta · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** desconfiado (P19 molesta)
- **Pantalla:** Caja › Abrir turno · **Tamaño:** Mac · **Rol:** dueño, cajero
- **Qué pasa:** El aviso y el campo Comentario aparecen antes de contar nada.
- **Cómo debería ser:** § Caja, Abrir turno: "si no coincide, pide un comentario" (después de contar).
- **Capturas:** `qa/ronda-1/desconfiado/16-cajera-vender-busqueda.png`

### Q86 · Abrir la caja desde el celular arranca en "Por billete": dos pantallas de +/−

- **Gravedad:** molesta · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** celular (P17 molesta)
- **Pantalla:** Vender › Abrí la caja para vender · **Tamaño:** iPhone · **Rol:** dueño
- **Qué pasa:** "Total directo" (ya precargado con $ 20.000) resuelve, pero no es lo primero que se ve.
- **Cómo debería ser:** § Caja, Abrir turno: por billete o total; en el celular, el total primero.
- **Capturas:** `qa/ronda-1/celular/pasos/006-06-cerrar-banner-vender.png`

### Q87 · Varios con monto negativo: el botón está habilitado y no hace nada

- **Gravedad:** molesta · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** destructor (P25 molesta)
- **Pantalla:** Vender › Varios (F3) · **Tamaño:** Mac · **Rol:** todos los que venden
- **Qué pasa:** "-500" muestra "−$ 500" y "Agregar · Enter" habilitado; clic y Enter no hacen nada.
- **Cómo debería ser:** § Vender: producto varios con monto > 0; botón apagado o mensaje.
- **Capturas:** `qa/ronda-1/destructor/mac/11-varios-negativo-boton-mudo.png`

### Q88 · Fiado a un cliente vencido y sobre el límite dice "pide PIN" pero al dueño no le pide nada

- **Gravedad:** molesta · **Estado:** arreglado (ronda 2 sin verlo)
- **Quiénes:** destructor (P26 molesta)
- **Pantalla:** Vender › Cobro › Fiado · **Tamaño:** Mac · **Rol:** dueño
- **Qué pasa:** El texto promete un PIN que no se pide (el dueño tiene permiso).
- **Cómo debería ser:** § Vender, Cobro, Fiado: "pide PIN" solo a quien no puede autorizar; al dueño, "Sobre el límite: lo autorizás vos".
- **Capturas:** `qa/ronda-1/destructor/mac/12-fiado-tano-vencido-sobre-limite.png`

### Q89 · Textos mal armados ("1 ítems", "una movimiento de caja") y números que se desbordan de la tarjeta

- **Gravedad:** molesta · **Estado:** sigue (ronda 2: desconfiado P13 molesta · destructor P29 molesta)
- **Quiénes:** destructor (P27 molesta)
- **Pantalla:** Vender · Avisos · Caja › Por billete · Proveedores · Clientes · **Tamaño:** ambos · **Rol:** todos
- **Qué pasa:** "1 ítems", "una ajuste de stock", "una cierre de caja", "1 precios cambian"; Limpieza Cuyo con la condición repetida; 99999 billetes de $ 20.000 se salen de la tarjeta.
- **Cómo debería ser:** CLAUDE.md: español rioplatense; plurales y género correctos; tope en cantidades de billetes.
- **Capturas:** `qa/ronda-1/destructor/mac/pasos/004-04-apertura-basura.png` · `qa/ronda-1/destructor/mac/pasos/009-09-avisos.png`

### Q90 · Los nombres con HTML se guardan tal cual (no se ejecutan) y ensucian todos los selectores

- **Gravedad:** molesta · **Estado:** sigue (ronda 2: destructor P16 confunde)
- **Quiénes:** destructor (P28 molesta)
- **Pantalla:** Productos · Proveedores · Usuarios · **Tamaño:** ambos · **Rol:** dueño
- **Qué pasa:** "<b>hola</b><script>…" literal en la pantalla de PIN, Recepción, Conteos y Vender. Nunca saltó el alert.
- **Cómo debería ser:** Recortar espacios y, en nombres, rechazar < y > (o limpiarlos).
- **Capturas:** `qa/ronda-1/destructor/mac/16-producto-codigo-duplicado-409.png`

### Q91 · Sesión vencida al guardar: el mensaje está bien, pero el header sigue mostrando a Carlos y la caja abierta, sin forma de volver a entrar

- **Gravedad:** molesta · **Estado:** sigue (ronda 2: destructor P17 confunde)
- **Quiénes:** destructor (P30 molesta)
- **Pantalla:** Productos › Editar (y cualquier formulario) · **Tamaño:** Mac · **Rol:** dueño
- **Qué pasa:** 401 → "Iniciá sesión para seguir." en el diálogo (y lo escrito se conserva), pero la pantalla de atrás sigue como logueada y no hay botón para entrar.
- **Cómo debería ser:** § Usuarios y permisos: al vencer la sesión, bloqueo con PIN o ingreso, conservando lo cargado.
- **Capturas:** `qa/ronda-1/destructor/mac/28-guardar-con-sesion-vencida.png`

## Hallazgos nuevos de la ronda 2

### Q208 · El gráfico "Por día" de Reportes es un cuadro en blanco (la barra del día queda fuera de la vista en el celular y no hay números)

- **Gravedad:** confunde · **Estado:** nuevo (ronda 2)
- **Quiénes:** celular (P07 confunde) · desconfiado (P09 confunde)
- **Pantalla:** Reportes › Ventas · **Tamaño:** iPhone, Mac · **Rol:** dueño
- **Qué pasa:** Con una venta hoy, el gráfico no muestra nada: en 375 px la barra del día 20 queda recortada por el desborde horizontal; y no hay ningún número.
- **Cómo debería ser:** § Reportes: gráfico por día contra el período anterior, legible en el celular, con el mejor día en números.
- **Capturas:** `qa/ronda-2/celular/32-reporte-por-dia.png`

### Q209 · El "conteo ciego" muestra el efectivo esperado en Caja una pantalla antes del arqueo

- **Gravedad:** confunde · **Estado:** nuevo (ronda 2)
- **Quiénes:** apurado (P10 molesta) · desconfiado (P04 confunde)
- **Pantalla:** Caja › Turno en curso › Arqueo · **Tamaño:** Mac · **Rol:** cajero, dueño
- **Qué pasa:** Caja muestra "Sistema $ 58.850" y el arqueo pide contar sin ver el esperado: el cajero ya lo vio.
- **Cómo debería ser:** § Caja: el turno en curso muestra la cuenta del efectivo esperado y el arqueo es ciego (spec). Contradice el spec: queda en BLOCKERS.md.
- **Capturas:** `qa/ronda-2/apurado/…`

### Q210 · El cierre acepta que "quede de fondo" más plata que la contada, y la apertura siguiente lo ignora

- **Gravedad:** bloquea · **Estado:** nuevo (ronda 2)
- **Quiénes:** destructor (P01 bloquea)
- **Pantalla:** Caja › Arqueo y cierre · **Tamaño:** Mac · **Rol:** dueño
- **Qué pasa:** Con "Queda de fondo" = 999999 y $ 142.270 contados, "Se retira $ 0" y el turno cierra; el ticket dice "Queda de fondo $ 999.999" y la apertura siguiente sigue diciendo "dejó $ 20.000".
- **Cómo debería ser:** § Caja, arqueo y cierre: lo que queda es parte de lo contado. Validar en la pantalla y en la operación.
- **Capturas:** `qa/ronda-2/destructor/mac/…`

### Q211 · El conteo acepta 1.599.999 unidades y "Aprobar todo" lo aplica sin preguntar

- **Gravedad:** bloquea · **Estado:** nuevo (ronda 2)
- **Quiénes:** destructor (P05 bloquea)
- **Pantalla:** Productos › Conteos · **Tamaño:** Mac · **Rol:** dueño
- **Qué pasa:** Coca-Cola quedó con stock 1.599.999 y Reportes › Stock dice $ 5.280 millones en góndola.
- **Cómo debería ser:** § Productos, conteo: tope razonable y confirmación con el resumen de diferencias antes de aprobar todo.
- **Capturas:** `qa/ronda-2/destructor/mac/…`

### Q212 · Importar pisa un producto existente por código repetido sin avisar (Coca-Cola renombrada a $ 20)

- **Gravedad:** bloquea · **Estado:** nuevo (ronda 2)
- **Quiénes:** destructor (P06 bloquea)
- **Pantalla:** Productos › Importar · **Tamaño:** Mac · **Rol:** dueño
- **Qué pasa:** La fila con el código de la Coca-Cola y otro nombre queda como "1 actualizados"; recién en esa pestaña se lee el cambio de nombre y precio.
- **Cómo debería ser:** § Productos, importar: lo que cambia de nombre o de precio en un producto existente se marca y se cuenta aparte en la vista previa.
- **Capturas:** `qa/ronda-2/destructor/mac/…`

### Q213 · "Volver" en "¿Quién sos?" devuelve la sesión del dueño sin PIN

- **Gravedad:** confunde · **Estado:** nuevo (ronda 2)
- **Quiénes:** desconfiado (P02 confunde)
- **Pantalla:** Cambiar de usuario · **Tamaño:** Mac · **Rol:** dueño
- **Qué pasa:** Después de "Cambiar de usuario", el botón Volver deja la sesión anterior abierta sin pedir nada.
- **Cómo debería ser:** § Usuarios y permisos: cambiar de usuario a pedido vuelve a quien estaba; el bloqueo por inactividad no se destraba sin PIN (T61). Volver es a pedido, no es bloqueo: se mantiene y se documenta.
- **Capturas:** `qa/ronda-2/desconfiado/…`

### Q214 · La cajera que entra después hereda el arqueo a medias del dueño

- **Gravedad:** confunde · **Estado:** nuevo (ronda 2)
- **Quiénes:** desconfiado (P03 confunde)
- **Pantalla:** Caja › Arqueo y cierre · **Tamaño:** Mac · **Rol:** cajero
- **Qué pasa:** El borrador del cierre (lo contado) se guarda por turno en el dispositivo y lo ve quien entre después.
- **Cómo debería ser:** El borrador es de quien lo contó.
- **Capturas:** `qa/ronda-2/desconfiado/…`

### Q215 · Inicio con la caja cerrada dice "Efectivo en caja $ 0" con $ 30.000 de fondo

- **Gravedad:** confunde · **Estado:** nuevo (ronda 2)
- **Quiénes:** desconfiado (P08 confunde)
- **Pantalla:** Inicio · **Tamaño:** Mac · **Rol:** dueño
- **Qué pasa:** Lo esperado es de los turnos abiertos; con todo cerrado muestra $ 0 en vez de decir que la caja está cerrada.
- **Cómo debería ser:** § Inicio: números del día. Con la caja cerrada, decirlo.
- **Capturas:** `qa/ronda-2/desconfiado/…`

### Q216 · Historial de ventas sin internet: esqueleto para siempre y la venta recién hecha no aparece

- **Gravedad:** confunde · **Estado:** nuevo (ronda 2)
- **Quiénes:** celular (P04 confunde)
- **Pantalla:** Vender › Historial de ventas · **Tamaño:** iPhone · **Rol:** dueño
- **Qué pasa:** Sin red, seis cuadros grises más de 13 s; la venta local no se ve hasta reconectar.
- **Cómo debería ser:** § Ventas sin conexión: lo local se ve siempre; sin red, la pantalla lo dice.
- **Capturas:** `qa/ronda-2/celular/14-historial-offline-10s.png`

### Q217 · La tabla del historial de ventas no entra en 375 px

- **Gravedad:** confunde · **Estado:** nuevo (ronda 2)
- **Quiénes:** celular (P06 confunde)
- **Pantalla:** Vender › Historial de ventas · **Tamaño:** iPhone · **Rol:** dueño
- **Qué pasa:** "Cajero · cliente" y "Medio" se pisan y el total queda cortado fuera de la pantalla.
- **Cómo debería ser:** § Requisitos transversales: cada pantalla en 393 px (y 375).
- **Capturas:** `qa/ronda-2/celular/16-historial-tabla-cortada-375.png`

### Q218 · "Resolver" en Avisos dice "Resuelto" sin resolver nada y el aviso no dice qué producto es

- **Gravedad:** confunde · **Estado:** nuevo (ronda 2)
- **Quiénes:** literal (P02 bloquea)
- **Pantalla:** Avisos · **Tamaño:** iPhone · **Rol:** repositor
- **Qué pasa:** Dos avisos idénticos "No se pudo registrar el producto"; Resolver los saca y nada cambia.
- **Cómo debería ser:** § Avisos: el aviso dice qué pasó (con nombre) y qué hacer.
- **Capturas:** `qa/ronda-2/literal/06-resolver-dice-resuelto-pero-no-se-cargo.png`

### Q219 · "Terminar conteo" con 3 de 29 contados no avisa nada

- **Gravedad:** confunde · **Estado:** nuevo (ronda 2)
- **Quiénes:** literal (P06 confunde)
- **Pantalla:** Productos › Conteos › Conteo de hoy · **Tamaño:** iPhone · **Rol:** repositor
- **Qué pasa:** Pasa a "Para revisar" sin preguntar por los 26 sin contar; "—" no dice si es 0 o no contado.
- **Cómo debería ser:** § Productos, conteo: contador "48 de 120"; confirmar antes de terminar con pendientes.
- **Capturas:** `qa/ronda-2/literal/11-conteo-terminado-con-3-de-29-sin-aviso.png`

### Q220 · "Cambiar de usuario" no ofrece "Entrar con email"

- **Gravedad:** confunde · **Estado:** nuevo (ronda 2)
- **Quiénes:** literal (P09 confunde)
- **Pantalla:** Más › Cambiar de usuario · **Tamaño:** iPhone · **Rol:** repositor
- **Qué pasa:** La pantalla "¿Quién sos?" a pedido tiene "Volver" en vez de "Entrar con email"; hay que adivinar "Salir".
- **Cómo debería ser:** § Usuarios y permisos, ingreso: dueño y encargado entran con email.
- **Capturas:** `qa/ronda-2/literal/08-cambiar-usuario-no-tiene-entrar-con-email.png`

### Q221 · Enter en la casilla del fondo no abre el turno (hay que tabular 20 veces hasta el botón)

- **Gravedad:** confunde · **Estado:** nuevo (ronda 2)
- **Quiénes:** apurado (P01 confunde)
- **Pantalla:** Caja › Abrir turno · **Tamaño:** Mac · **Rol:** cajero
- **Qué pasa:** Solo teclado: Enter no hace nada en Total directo ni en los billetes.
- **Cómo debería ser:** § Vender con teclado: Enter confirma en cada formulario de una pantalla.
- **Capturas:** `qa/ronda-2/apurado/…`

### Q222 · "*3" después de escanear queda como texto: la ayuda no dice el orden "3 *"

- **Gravedad:** confunde · **Estado:** nuevo (ronda 2)
- **Quiénes:** apurado (P02 confunde)
- **Pantalla:** Vender · **Tamaño:** Mac · **Rol:** cajero
- **Qué pasa:** El multiplicador funciona solo antes del escaneo y la ayuda no lo aclara.
- **Cómo debería ser:** § Vender, atajos: "3 *" multiplica; con una línea elegida, "* 3" la deja en 3.
- **Capturas:** `qa/ronda-2/apurado/…`

### Q223 · Un producto recién creado desde el mostrador pregunta "¿Vender igual?" por falta de stock

- **Gravedad:** confunde · **Estado:** nuevo (ronda 2)
- **Quiénes:** apurado (P05 confunde)
- **Pantalla:** Vender › Alta rápida · **Tamaño:** Mac · **Rol:** cajero
- **Qué pasa:** Se carga sin stock inicial y en la misma venta la app avisa que no hay stock.
- **Cómo debería ser:** § Vender, alta rápida: diez segundos y sigue la venta; sin preguntas de stock para lo recién cargado.
- **Capturas:** `qa/ronda-2/apurado/…`

### Q224 · Arqueo: los otros medios sin cargar cuentan como contado = sistema y diferencia $ 0

- **Gravedad:** confunde · **Estado:** nuevo (ronda 2)
- **Quiénes:** apurado (P09 confunde)
- **Pantalla:** Caja › Arqueo y cierre · **Tamaño:** Mac · **Rol:** cajero
- **Qué pasa:** Si no se cargan los cupones, el resultado los da por coincidentes sin decirlo.
- **Cómo debería ser:** Decir qué pasa con lo vacío.
- **Capturas:** `qa/ronda-2/apurado/…`

### Q225 · Recepción acepta 10 dañados sobre 5, vencimiento 2020 y costo −100; recargar pierde lo cargado

- **Gravedad:** confunde · **Estado:** nuevo (ronda 2)
- **Quiénes:** destructor (P12 confunde)
- **Pantalla:** Compras › Recibir · **Tamaño:** Mac · **Rol:** dueño
- **Qué pasa:** "Listo" cierra la línea con cualquier cosa; el error aparece recién al confirmar o nunca.
- **Cómo debería ser:** Validar cada línea al tocar Listo, con el nombre del producto.
- **Capturas:** `qa/ronda-2/destructor/mac/…`

### Q226 · Categorías deja crear una segunda "Lácteos"

- **Gravedad:** confunde · **Estado:** nuevo (ronda 2)
- **Quiénes:** destructor (P15 confunde)
- **Pantalla:** Productos › Categorías · **Tamaño:** Mac · **Rol:** dueño
- **Qué pasa:** Dos "Lácteos" iguales en todos los selectores.
- **Cómo debería ser:** Nombre único por nivel.
- **Capturas:** `qa/ronda-2/destructor/mac/…`

### Q227 · Cierre por billete: "−5" cuenta 5, "1,5" cuenta 15 y "1e2" cuenta 12, sin aviso

- **Gravedad:** confunde · **Estado:** nuevo (ronda 2)
- **Quiénes:** destructor (P18 confunde)
- **Pantalla:** Caja › Arqueo · **Tamaño:** Mac · **Rol:** dueño
- **Qué pasa:** El contador de billetes tira lo que no es dígito y arma otro número.
- **Cómo debería ser:** Solo enteros: lo demás no entra.
- **Capturas:** `qa/ronda-2/destructor/mac/…`

### Q228 · Varios acepta $ 999.999.999.999 y una descripción de 5000 letras; el rechazo llega al cobrar, con nombres internos

- **Gravedad:** confunde · **Estado:** nuevo (ronda 2)
- **Quiénes:** destructor (P19 confunde)
- **Pantalla:** Vender › Varios · **Tamaño:** Mac · **Rol:** cajero
- **Qué pasa:** El ítem entra al carrito y el cobro falla con "unitPriceCents".
- **Cómo debería ser:** Validar en el diálogo con el tope de $ 99.999.999 y 200 caracteres.
- **Capturas:** `qa/ronda-2/destructor/mac/…`

### Q229 · El cajero ve la lista de proveedores con sus WhatsApp por URL aunque Compras le dice "sin permiso"

- **Gravedad:** confunde · **Estado:** nuevo (ronda 2)
- **Quiénes:** destructor (P22 confunde)
- **Pantalla:** Compras › Proveedores · **Tamaño:** Mac · **Rol:** cajero
- **Qué pasa:** /api/suppliers responde 200 a cajero y repositor.
- **Cómo debería ser:** § Usuarios y permisos: la API valida cada permiso; proveedores para quien recibe o arma pedidos.
- **Capturas:** `qa/ronda-2/destructor/mac/…`

### Q230 · Los botones de efectivo rápido no tienen tecla

- **Gravedad:** molesta · **Estado:** nuevo (ronda 2)
- **Quiénes:** apurado (P07 molesta)
- **Pantalla:** Vender › Cobro · **Tamaño:** Mac · **Rol:** cajero
- **Qué pasa:** Solo con el mouse.
- **Cómo debería ser:** § Vender con teclado.
- **Capturas:** `qa/ronda-2/apurado/…`

### Q231 · "Ganancia 44 %" en Productos y "Margen 30 %" en Rentabilidad para el mismo producto

- **Gravedad:** molesta · **Estado:** nuevo (ronda 2)
- **Quiénes:** desconfiado (P07 confunde)
- **Pantalla:** Productos · Reportes › Rentabilidad · **Tamaño:** Mac · **Rol:** dueño
- **Qué pasa:** Ganancia sobre el costo en la ficha y margen sobre el precio en los reportes, sin aclararlo.
- **Cómo debería ser:** § Productos, datos de la ficha: así lo define el spec; la columna lo dice ("Ganancia", sobre el costo).
- **Capturas:** `qa/ronda-2/desconfiado/…`

### Q232 · "PIN cambiado" pero la lista sigue diciendo "Sin PIN" hasta recargar

- **Gravedad:** molesta · **Estado:** nuevo (ronda 2)
- **Quiénes:** desconfiado (P11 molesta)
- **Pantalla:** Ajustes › Usuarios · **Tamaño:** Mac · **Rol:** dueño
- **Qué pasa:** La lista no se refresca.
- **Cómo debería ser:** Refrescar al guardar.
- **Capturas:** `qa/ronda-2/desconfiado/…`

### Q233 · En el celular la cantidad de una línea no se edita tocando el número

- **Gravedad:** molesta · **Estado:** nuevo (ronda 2)
- **Quiénes:** celular (P08 molesta)
- **Pantalla:** Vender · **Tamaño:** iPhone · **Rol:** dueño
- **Qué pasa:** Solo con +/−.
- **Cómo debería ser:** § Vender en celular: tocar la cantidad abre el teclado.
- **Capturas:** `qa/ronda-2/celular/…`

### Q234 · "Sin nada para pedir porque ya hay un pedido en camino" aparece arriba de un sugerido de $ 124.250

- **Gravedad:** molesta · **Estado:** nuevo (ronda 2)
- **Quiénes:** celular (P10 molesta)
- **Pantalla:** Compras › Sugerido · **Tamaño:** iPhone · **Rol:** dueño
- **Qué pasa:** La nota habla de otro proveedor pero se lee como si fuera del que está en pantalla.
- **Cómo debería ser:** La nota va al pie de la lista.
- **Capturas:** `qa/ronda-2/celular/…`

### Q235 · Abrir el enlace de WhatsApp en Chromium sin la app da un 404 de api.whatsapp.com en la consola

- **Gravedad:** molesta · **Estado:** nuevo (ronda 2)
- **Quiénes:** celular (P12 molesta)
- **Pantalla:** Compras › Pedido › Enviar · **Tamaño:** iPhone · **Rol:** dueño
- **Qué pasa:** Es externo: el navegador de prueba no tiene WhatsApp.
- **Cómo debería ser:** No se arregla: en un iPhone real abre WhatsApp. Va a PRUEBA-MANUAL.md.
- **Capturas:** `qa/ronda-2/celular/…`

### Q236 · "Caja cerrada" en todas las pantallas de un rol que no ve caja

- **Gravedad:** molesta · **Estado:** nuevo (ronda 2)
- **Quiénes:** literal (P10 molesta)
- **Pantalla:** Barra superior · **Tamaño:** iPhone · **Rol:** repositor
- **Qué pasa:** La pastilla de caja aparece aunque el rol no tiene caja.
- **Cómo debería ser:** Solo para quien tiene turno.
- **Capturas:** `qa/ronda-2/literal/01-inicio-iconos-sin-texto.png`

### Q237 · El título de la barra se corta en el celular: "Produ…", "Comp…"

- **Gravedad:** molesta · **Estado:** nuevo (ronda 2)
- **Quiénes:** literal (P11 molesta)
- **Pantalla:** Barra superior · **Tamaño:** iPhone · **Rol:** todos
- **Qué pasa:** La pastilla de caja y tres íconos no dejan lugar.
- **Cómo debería ser:** Que se lea entero.
- **Capturas:** `qa/ronda-2/literal/02-productos-titulo-cortado-ok-stock.png`

### Q238 · El buscador de Productos queda chiquito al lado de "+ Nuevo"

- **Gravedad:** molesta · **Estado:** nuevo (ronda 2)
- **Quiénes:** literal (P12 molesta)
- **Pantalla:** Productos · **Tamaño:** iPhone · **Rol:** dueño
- **Qué pasa:** Se ve "nelada" de "Mermelada".
- **Cómo debería ser:** El buscador en su propia fila en el celular.
- **Capturas:** `qa/ronda-2/literal/pasos/028-28-terminar.png`

### Q239 · Apertura de caja: con "😈" o letras abre con $ 0 sin avisar

- **Gravedad:** molesta · **Estado:** nuevo (ronda 2)
- **Quiénes:** destructor (P24 molesta)
- **Pantalla:** Caja › Abrir turno · **Tamaño:** Mac, iPhone · **Rol:** todos
- **Qué pasa:** Lo que no es un monto se toma como $ 0.
- **Cómo debería ser:** Decir "Poné un monto".
- **Capturas:** `qa/ronda-2/destructor/mac/…`

### Q240 · Historial de cierres: columnas sin título y el turno de Lucía dice "$ 0 / $ 0"

- **Gravedad:** molesta · **Estado:** nuevo (ronda 2)
- **Quiénes:** destructor (P25 molesta)
- **Pantalla:** Caja › Historial de cierres · **Tamaño:** Mac · **Rol:** dueño
- **Qué pasa:** Dos columnas sin encabezado; el cierre del escenario sin contado.
- **Cómo debería ser:** Encabezados y datos del escenario completos.
- **Capturas:** `qa/ronda-2/destructor/mac/…`

### Q241 · Descuento: al reabrir no muestra el descuento ya aplicado

- **Gravedad:** molesta · **Estado:** nuevo (ronda 2)
- **Quiénes:** destructor (P26 molesta)
- **Pantalla:** Vender › Descuento · **Tamaño:** Mac · **Rol:** cajero
- **Qué pasa:** El campo aparece vacío aunque el descuento sigue en el total.
- **Cómo debería ser:** Mostrar el aplicado.
- **Capturas:** `qa/ronda-2/destructor/mac/…`

## Ronda 3 (20/10/2026)

Instalaciones nuevas, los mismos cinco usuarios y el mismo recorrido, después de T64. Informes en `qa/ronda-3/<usuario>.md`. Problemas por usuario: apurado 13 · desconfiado 16 · celular 13 · literal 17 · destructor 37 (96 en total; 12 bloquean, 46 confunden, 38 molestan).

- **Primer éxito:** los cinco lo lograron (turno cerrado, primera venta, venta con cámara sin red, recepción confirmada y todos los formularios recorridos).
- **Lo que bloqueó:** casi todo fue una regresión de T62 en Recepción (la pantalla se reiniciaba con cada sincronización). Se arregló en T66 con un e2e que corta la red en medio de la recepción.
- **Q de rondas anteriores que volvieron:** Q22 (conteos escondidos), Q237 (título cortado), Q55 (íconos sin texto), Q231 (Ganancia contra Margen), Q212 (importar pisa nombres, ahora con aviso), Q227 y Q65 (billetes), Q62 (avisos en memoria). Los demás Q de la ronda 2 no volvieron a aparecer.
- **Estado:** la meta pedía una ronda sin bloquea ni confunde. La ronda 3 no lo logró; era la última ronda permitida. Lo arreglado en T66 no tuvo otra ronda de usuarios: queda verificado por tests y e2e. Lo abierto está en BLOCKERS.md.
- **Después (T67, 22/10):** se arreglaron 14 de los 18 abiertos (Q266, Q269 a Q274, Q276 a Q282) y parte de Q283. Quedan Q267, Q268 y Q275, que tocan el spec, y lo que resta de Q283. Sin otra ronda de usuarios: tres era el máximo.

### Arreglados en T66 (verificados con tests, sin otra ronda de usuarios)

| Q | Gravedad | Qué pasaba | Quiénes |
| --- | --- | --- | --- |
| Q242 | bloquea | Recepción se reinicia sola y borra lo cargado (regresión de T62: la clave de la consulta cambiaba con cada sincronización) | literal P01, P02, P03 · celular P01, P02, P03 · destructor P01 |
| Q243 | bloquea | "Por plata" en el peso no se activa con Enter: la plata se carga como peso | apurado P01 |
| Q244 | bloquea | Con "Crédito" elegido, Enter no cobra; crédito sin atajo | apurado P02, P03 |
| Q245 | bloquea | "Entrar de nuevo" con la sesión vencida en el celular no lleva al login | destructor P02 |
| Q246 | bloquea | Los conteos no están en ningún menú y la pantalla vacía no dice que están apagados ni quién los crea | literal P05, P06 |
| Q247 | confunde | "−" con una unidad borra la línea sin aviso | apurado P04 |
| Q248 | confunde | Inicio del repositor: "No tenés tareas" con un pedido para recibir el jueves | literal P07 |
| Q249 | confunde | Íconos de la barra del celular sin texto y título cortado | literal P11, P17 |
| Q250 | confunde | El producto creado al vuelo dispara "stock negativo" | celular P06 |
| Q251 | confunde | La nota "pedido en camino" de un proveedor aparece en el pedido de otro | celular P08 |
| Q252 | confunde | Cuenta corriente: dos "queda" en el mismo renglón | celular P12 · desconfiado P12 |
| Q253 | confunde | Cliente nuevo "sin límite" y a la vez "límite $ 0" | desconfiado P07 |
| Q254 | confunde | Reportes › Caja: "Retiros $ 0" con $ 21.000 a la caja fuerte al cerrar | desconfiado P15 |
| Q255 | confunde | La cajera ve en memoria el aviso del dueño al entrar con su PIN | desconfiado P16 · destructor P23 |
| Q256 | confunde | "Listo: ya puede entrar con su PIN" sin dispositivo habilitado | desconfiado P04 |
| Q257 | confunde | El importador rechaza los PLU de los pesables sin decir qué hacer | desconfiado P01 |
| Q258 | confunde | Billetes "1,5, 20000" se guardan como tres billetes; contar "1,5" billetes da 15 | destructor P03, P04 |
| Q259 | confunde | Tipear el monto en Cobrar fiado se toma como escaneo | destructor P05 |
| Q260 | confunde | Proveedor repetido y CUIT "123" se guardan | destructor P06, P07 |
| Q261 | confunde | Importar acepta stock 2,5 en un producto por unidad | destructor P10 |
| Q262 | confunde | Ajustar stock deja −94 sin preguntar y con la nota larga el error sale en otro campo | destructor P12, P13 |
| Q263 | confunde | "defaultMarginBp" en un error y en Varios el error de la descripción habla del monto | destructor P17, P18 |
| Q264 | confunde | El cajero en Proveedores por URL ve "Algo falló" en vez de "sin permiso" | destructor P24 |
| Q265 | confunde | "Ese PIN ya lo usa otra persona" delata un PIN ajeno | destructor P27 |

### Arreglados en T67 (verificados con tests y e2e, sin otra ronda de usuarios)

| Q | Gravedad | Qué pasaba | Quiénes | Arreglo |
| --- | --- | --- | --- | --- |
| Q266 | confunde | Arqueo y cierre con teclado: sin atajo, foco y Enter (y sin "Total directo") | apurado P05, P06 | F8 y Enter llevan al cierre, foco en el primer billete, Enter ve el resultado y cierra. "Total directo" no: el spec pide el conteo por billete (DECISIONS) |
| Q269 | confunde | "12 → …" en la recepción no se entiende | literal P08 | Cada renglón dice "Pedido 12 · falta contar" o "Llegó 10" |
| Q270 | confunde | "Entrar con email" no hace nada la primera vez | literal P09 | "Entrar con email" va directo al login |
| Q271 | confunde | En "Nuevo producto" la categoría solo ofrece "Sin categoría" | literal P10 | Categorías como opciones planas ("Almacén › Infusiones") y, sin servidor, las de la copia local |
| Q272 | confunde | Ajustes con palabras técnicas (Funciones, conteo ciego) | literal P12 | Ajustes con palabras de almacén: Funciones nombra los conteos, sin "Fase 2" ni "push" |
| Q273 | confunde | Al volver internet nada dice que la venta o la recepción se subió | celular P04 | Al volver internet, un aviso dice que se subió lo guardado en el dispositivo |
| Q274 | confunde | El sugerido no avisa que ya hay un borrador igual (y deja crear otro) | celular P07 · destructor P08 | El sugerido avisa "Ya tenés el pedido 0042 en borrador" con enlace |
| Q276 | confunde | Lista de clientes con dos montos sin encabezado; nombre del dispositivo mezclado | desconfiado P05, P11 | Encabezados Cliente · Límite · Saldo · Estado; el nombre del dispositivo se selecciona entero al entrar |
| Q277 | confunde | Pedido sugerido acepta cantidades raras sin avisar en la pantalla | destructor P09 | Cada cantidad mal se marca en su campo (negativa, más de 100.000, decimales por unidad), el bulto incompleto se avisa y los botones esperan |
| Q278 | confunde | Conteo de 99.999 unidades se muestra en verde y se aprueba (con la confirmación) | destructor P14 | Una diferencia enorme se marca "¿Seguro? Revisalo" y la confirmación de Aprobar todo la nombra |
| Q279 | confunde | Recepción: costo negativo propone un precio de venta negativo | destructor P15 | Costo, vencimiento y dañados con el error en su campo; sin precio sugerido con un costo inválido; el renglón queda "Para revisar" |
| Q280 | confunde | "*99999 Enter" abre el alta rápida; "-5*" y "1,5*" se ignoran sin aviso | destructor P19 | "* 99999" no se toma como código y dice el tope; "1,5 *" y "-5 *" avisan |
| Q281 | confunde | Sesión vencida en la Mac con PIN no dice cómo seguir | destructor P21 | La franja de sesión vencida (y "¿Quién sos?") ahora también en la compu y el modo mostrador; el formulario dice qué hacer |
| Q282 | confunde | Medios de pago: los interruptores se guardan solos y los campos no | destructor P29 | Alias y CVU se guardan solos al salir del campo, como los interruptores; CVU con error si no son 22 números |

### Abiertos (van a BLOCKERS.md)

| Q | Gravedad | Qué pasa | Quiénes |
| --- | --- | --- | --- |
| Q267 | confunde | Los pesables dan totales que no se pagan justo en efectivo (redondeo) | apurado P07 |
| Q268 | confunde | Repositor: no hay lugar para cargar productos y nada lo explica | literal P04 |
| Q275 | confunde | Márgenes que no cierran: % de Inicio, recargo fuera del margen, Ganancia contra Margen | desconfiado P08, P09 |
| Q283 | molesta | Detalles de la ronda 3 que quedan: QR que no entra en 800 px, ticket que corta textos, "Vender como varios" pierde el código, "13 op." con dos billetes, y el resto de lo marcado como molesta (en T67 se arreglaron el doble signo, el cobro encimado, "PAGOS" vacío, los encabezados pegados, "1 productos" y la cantidad partida del pesable) | apurado P08–P13 · literal P13–P16 · celular P05, P09–P11, P13 · desconfiado P02, P03, P06, P10, P13, P14 · destructor P11, P16, P20, P22, P25, P26, P28, P30–P37 |

## Hallazgos de las auditorías que ningún usuario volvió a ver

El 22/10 se revisó cada uno contra el código: la ronda 2 los había dado por arreglados solo porque nadie los volvió a ver, y 38 de Q99 a Q159 seguían del todo o en parte. Entran a la fusión con su ID original (C = cámara, U = UI). El detalle completo, con archivo y línea, está en `docs/auditoria/camara.md` y `docs/auditoria/ui.md`.

| Q | Origen | Gravedad | Estado | Pantalla | Tamaño | Qué pasa |
| --- | --- | --- | --- | --- | --- | --- |
| Q92 | U01 | bloquea | arreglado (ronda 2 sin verlo) | Barra superior › Búsqueda global | Mac | El botón "Buscar · Ctrl K" no tiene `onClick` y no hay ningún manejador de Ctrl+K en la app. El botón no hace nada. En el celular tampoco hay lupa. |
| Q93 | U02 | bloquea | arreglado (ronda 2 sin verlo) | Bloqueo por inactividad (dispositivo habilitado) | Ambos | El bloqueo automático a los 5 min reutiliza `LockScreen` con `onCancel`: el botón "Volver" cierra el bloqueo sin pedir PIN. Cualquiera destraba la sesión del cajero tocando "Volver". |
| Q94 | U03 | bloquea | arreglado (ronda 2 sin verlo) | Vender › Venta | iPhone | No hay forma de asignar cliente: el selector solo se abre con F5 o con el botón del panel de Mac. La rama de celular tiene "Espera", "Varios" y "Más" (que abre Descuento). Sin cliente, la pestaña Fiado del cobro dice… |
| Q95 | U04 | bloquea | arreglado (ronda 2 sin verlo) | Vender › Historial | iPhone | La única entrada al historial es el enlace "Historial de ventas" del panel derecho de Mac; en el celular ninguna pantalla enlaza a `/vender/historial` (tampoco "Más"). |
| Q96 | U06 | bloquea | arreglado (ronda 2 sin verlo) | Productos › Categorías | Ambos | No existe la pantalla de categorías: ni ruta `productos/categorias` ni entrada en "Más acciones". No se puede crear una categoría ni fijar su ganancia por defecto. |
| Q97 | U10 | bloquea | arreglado (ronda 2 sin verlo) | Productos › Lista › Cambiar categoría | Ambos | La hoja "Cambiar categoría de N productos" hace N PATCH y, si alguno falla, no muestra nada: `m.isError` no se usa, la hoja queda abierta con el botón habilitado. |
| Q98 | U11 | bloquea | arreglado (ronda 2 sin verlo) | Clientes y fiado › Cobrar fiado › "Elegir tickets" | Ambos | Al elegir "Elegir tickets" aparece una columna de casillas de 18 px sin ningún texto visible: `Checkbox` pone el texto solo en `aria-label`. El usuario no ve qué ticket ni qué monto está marcando. |
| Q99 | C04 | confunde | arreglado | Vender | iPhone | Los avisos "Sin stock según el sistema. ¿Vender igual?" (por línea) y "es para mayores de 18" se dibujan en la página, tapados por la cámara. El producto sí entra, pero el cajero no se entera hasta cerrar la cámara. |
| Q100 | C09 | confunde | prueba manual (docs/PRUEBA-MANUAL.md, paso 5 de la cámara) | CameraScanner | iPhone | Foco de cerca en iPhone Pro: `focusMode` va en `advanced`, que el navegador puede ignorar sin error; no se pide `zoom` ni se elige cámara. La principal de los iPhone 13 Pro en adelante enfoca desde ~20 cm; la app Cámara… |
| Q101 | C10 | confunde | arreglado (T62, 22/10) | Vender, Inicio, Modo carga, Recepción, Conteo (dispositivo nuevo) | iPhone | El pull baja **todo** el `change_log` de a 1000 cambios por página, hasta 1000 páginas, guardando el cursor por página (se retoma si se corta). No hay tope práctico: el catálogo completo llega. Pero mientras llega… |
| Q102 | C20 | confunde | arreglado | Pruebas | iPhone | No hay ningún test ni e2e del camino de cámara: los e2e escanean con `scanWithGun`, y `scanner.test.tsx` solo cubre el filtro de repetición y la pistola. Nada protege C01-C05. |
| Q103 | U17 | confunde | arreglado (T62, 22/10) | Inicio › Panel del día (sin ventas) | Ambos | El vacío "Todavía no hay ventas hoy" no trae acción aunque la caja esté cerrada, y queda al final de la página, debajo de "Medios de pago del día" y "Lo más vendido hoy" que repiten el mismo texto (tres veces). |
| Q104 | U18 | confunde | arreglado (T62, 22/10) | Inicio › Panel del día (sin conexión) | Ambos | Sin internet se muestra "No pudimos cargar esto / El panel del día se ve con conexión" con Reintentar; no se conservan los últimos números. |
| Q105 | U19 | confunde | arreglado | Caja › Retiro/Gasto/Ingreso › Autorizá con tu PIN | Ambos | El overlay dice solo "Retiro de $ 4.500 · pedido por Tomás." y no dice de quién tiene que ser el PIN. |
| Q106 | U20 | confunde | arreglado | Inicio › Accesos rápidos › "Registrar gasto" | Ambos | El botón navega a `/caja` a secas; `CashPage` no lee ningún parámetro. El usuario cae en Turno en curso (o Abrir turno) y tiene que buscar el gasto. |
| Q107 | U21 | confunde | arreglado | Vender › Venta | iPhone | El botón "Más" (ícono de menú) abre directamente la hoja "Descuento", y con la venta vacía no hace nada. |
| Q108 | U22 | confunde | arreglado (T62, 22/10) | Productos › Vencimientos › "Poner en oferta" | Ambos | Navega a `/productos/promociones?producto=…`, pero PromotionsPage no lee ningún parámetro: el usuario cae en la lista de promociones sin nada preseleccionado. |
| Q109 | U23 | confunde | arreglado (T62, 22/10) | Compras › Pedidos › Detalle › "Cerrar" | Ambos | El botón para cerrar el pedido dice solo "Cerrar", al lado del panel de detalle: se lee como "cerrar el panel". |
| Q110 | U25 | confunde | arreglado (T62, 22/10) | Compras › Sugerido › acciones · Hoja "Enviar pedido" | Ambos | Con proveedor sin WhatsApp o canal "Manual"/"Compra en persona", la acción primaria sigue siendo "Enviar por WhatsApp"; la hoja dice "sin WhatsApp cargado: elegís el contacto en el chat" y mantiene "Abrir WhatsApp". No… |
| Q111 | U26 | confunde | arreglado | Vender › Historial (vacío) | Ambos | "No hay ventas con ese filtro" / "Todavía no hay ventas hoy." sin ninguna acción. |
| Q112 | U27 | confunde | arreglado | Caja › Historial de cierres (vacío) | Ambos | "Todavía no hay cierres" sin texto ni acción. |
| Q113 | U28 | confunde | arreglado (T62, 22/10) | Compras › Pedidos · Proveedores · Facturas y pagos · Sugerido (vacíos) | Ambos | Vacíos sin botón: "No hay pedidos acá · Armalos desde el pedido sugerido" (sin enlace), "Todavía no hay proveedores · Cargá a quién le comprás…" (sin "Nuevo proveedor"), "No hay nada para pagar" / "Todavía no hay pagos"… |
| Q114 | U31 | confunde | arreglado (T62, 22/10) | Vender › Venta (sin configuración de cajas) · Caja | Ambos | Vender muestra "Bajando la configuración de las cajas…" sin Reintentar ni explicación si no hay conexión; Caja muestra "Todavía no bajó la configuración de las cajas. Revisá la conexión." sin Reintentar. |
| Q115 | U33 | confunde | arreglado (T62, 22/10) | Reportes › Exportar | Ambos | Los botones dicen "Excel" y "CSV" (sustantivos sin verbo); no hay PDF ni "compartir"; sin conexión no se deshabilitan ni explican. |
| Q116 | U35 | confunde | arreglado (T62, 22/10) | Compras › Sugerido y Pedidos › Detalle › "Enviar por WhatsApp" | Ambos | Se muestra a cualquiera con `build_orders` (incluye encargado), pero la matriz define `send_orders` ("Enviar pedidos por WhatsApp") solo para el dueño; `send_orders` no se usa ni en web ni en API. |
| Q117 | U36 | confunde | arreglado | Inicio › "Tus tareas" (encargado sin reportes) | Ambos | Un encargado al que le apagaron Reportes ve la pantalla del repositor con el pie "No ves ventas, costos ni caja: tu rol es repositor." aunque sea encargado. |
| Q118 | U38 | confunde | arreglado (T62, 22/10) | Hojas y formularios fuera de Vender (Nuevo/Editar proveedor, Nuevo pedido fijo, Cargar… | Mac | Ninguna usa `<form>`: Enter en un campo no guarda; hay que ir con el mouse al botón del pie. Esc sí cierra (Sheet). En Cobrar fiado el teclado tipea el monto pero no hay Enter ni Ctrl+Enter para "Registrar pago". |
| Q119 | U39 | confunde | arreglado (T62, 22/10) | Caja › Abrir turno, Retiro/Gasto/Ingreso, Arqueo | Mac | Ningún formulario de Caja escucha Enter: en "Total directo", en Monto/Motivo de la hoja y en "Otros medios"/"Comentario" del cierre, Enter no confirma. |
| Q120 | U40 | confunde | arreglado | Todas las que usan `Button` tamaño `md` (el default: Inicio › Requiere atención, Avisos ›… | iPhone | `md` es `h-10` (40 px) en todos los anchos; no hay variante por breakpoint. En el celular casi todos los botones de acción miden 40 px. |
| Q121 | U41 | confunde | arreglado | Todas las que usan `FilterChip` como selector (Caja: "Por billete/Total directo", tipo de… | iPhone | El chip es un botón de `h-8` (32 px) y en varias hojas es el selector principal del modo. En Cobrar fiado es el único selector de medio de pago. |
| Q122 | U42 | confunde | arreglado (T62, 22/10) | Vender › Cobro | iPhone | Billetes rápidos "$ 1.000 … $ 20.000" y "Justo" miden `h-12` (48 px); "Imprimir / Compartir / Sin ticket" `h-9` (36 px); píldoras "Débito / Crédito" y "QR o billetera / Transferencia" `h-8` (32 px); la X "Volver a la… |
| Q123 | U43 | confunde | arreglado | Vender › Venta › Pesable | iPhone | La hoja de peso es `fixed inset-0` sin `max-h` ni `overflow-y`; en "Por plata" apila cabecera, toggle, "Plata pedida", "Para el fiambrero", peso, atajos, teclado de 4 filas de 56 px, botón de 56 y "Cancelar", y la parte… |
| Q124 | U44 | confunde | arreglado (T62, 22/10) | Vender › Historial › Devolver | iPhone | Toggle "Góndola / Merma" de `h-8` (32 px) por línea y `Stepper` de cantidad sin `big` (36 px). Las etiquetas son sustantivos sueltos sin la pregunta. |
| Q125 | U45 | confunde | arreglado (T62, 22/10) | Caja › Turno en curso | iPhone | La acción principal "Arqueo y cierre" es un `Button` md (40 px) en la cabecera junto a Retiro, Gasto, Ingreso e Historial (cinco botones de 40 px en `flex-wrap`). |
| Q126 | U46 | confunde | arreglado (T62, 22/10) | Compras › Recepción › línea activa | iPhone | "Dañado" y "Lote y vencimiento" son `Chip size="md"` (32 px) envueltos en `<button>` sin estilo de botón: no parecen tocables. |
| Q127 | U47 | confunde | arreglado | Caja › Abrir turno › Por billete · Arqueo › 1 · Contá el efectivo | iPhone | La fila por denominación es `grid-cols-[90px_1fr_110px] gap-3` y el Stepper `big` mide 144 px, así que la fila necesita 368 px en ~319 útiles. En Abrir turno el subtotal se sale de la tarjeta (scroll horizontal); en… |
| Q128 | U48 | confunde | arreglado | Vender › Historial | iPhone | La tabla usa columnas fijas `80px_56px_minmax(0,1fr)_110px_100px` (378 px con gaps) en 329 px útiles con `overflow-hidden`: la columna Total queda cortada y "Cajero · cliente" se achica a 0. |
| Q129 | U49 | confunde | arreglado (T62, 22/10) | Reportes › Tablas | iPhone | Las tablas van en `overflow-x-auto` con celdas `whitespace-nowrap`: en 393 px las de 4 o más columnas tienen scroll horizontal; no hay versión de tarjetas. |
| Q130 | U50 | confunde | arreglado (T62, 22/10) | Ajustes › Avisos | iPhone | La matriz es una `<table>` con `min-w-[640px]` (scroll horizontal en 393 px), casillas nativas de 16 px y dos casillas pegadas por celda que solo se distinguen por el encabezado "app · push". |
| Q131 | U52 | confunde | arreglado | Productos › Vencimientos | iPhone | La fila tiene tres botones `whitespace-nowrap` en un `flex gap-2` sin `flex-wrap` ("Poner en oferta", "Devolver", "Dar de baja"): a 393 px "Dar de baja" queda cortado. |
| Q132 | U53 | confunde | arreglado (T62, 22/10) | Compras › Proveedores › Ficha | iPhone | Al tocar un proveedor, la ficha se renderiza debajo de toda la lista (la grilla solo divide columnas en `lg:`); con varios proveedores queda fuera de pantalla y parece que el toque no hizo nada. |
| Q133 | U54 | confunde | arreglado (T62, 22/10) | Caja › Historial de cierres | iPhone | Al tocar un cierre, el comprobante se renderiza en un `<aside>` después de toda la lista: en el celular no pasa nada visible salvo el resaltado, hay que bajar hasta el final y no hay forma de cerrarlo. |
| Q134 | U55 | confunde | arreglado (T62, 22/10) | Compras › Sugerido › "la cuenta" | iPhone | La explicación en palabras ("Vendés 3 por día…") vive en un `aside` que en el celular cae debajo de toda la lista; al tocar un producto arriba no se ve nada cambiar. |
| Q135 | U56 | confunde | arreglado (T62, 22/10) | Vender › Venta › Línea | Ambos | Tocar una línea solo la selecciona (Mac) o no hace nada (iPhone): no hay edición de cantidad exacta, descuento por ítem, precio ni nota. La ayuda dice "* multiplicar" donde el diseño dice "Enter abre la línea". |
| Q136 | U60 | confunde | arreglado | Vender › Cobro › pestaña Fiado | Ambos | La pestaña "Fiado" se deshabilita cuando el medio está apagado en Ajustes, sin decir por qué. |
| Q137 | U61 | confunde | arreglado | Vender › Venta › Cajón (F10) | Ambos | El aviso dice "Cajón abierto (sin impresora, abrilo a mano)": afirma que se abrió y a la vez pide abrirlo a mano. |
| Q138 | U62 | confunde | arreglado (T62, 22/10) | Vender › Historial › filtros | Ambos | Solo "Hoy, Efectivo, Tarjeta, Fiado, Anuladas, Con devolución", excluyentes entre sí: al elegir "Efectivo" se pierde "Hoy" y se listan ventas de siempre. No hay filtro por fecha ni por cajero. |
| Q139 | U64 | confunde | parcial (T62): Esc y el resultado a la vista; sigue en una página, no en asistente (DECISIONS) | Caja › Arqueo y cierre | Ambos | El diseño es un asistente de 3 pasos (indicador, atrás, "Contá el efectivo · 1 de 3", "Seguir: otros medios"). La app muestra todo en una sola página sin indicador, sin atrás/X ni Esc; en el iPhone el resultado aparece… |
| Q140 | U65 | confunde | arreglado | Caja › Abrir turno (también en Vender) | Ambos | El título es "Abrí la caja para vender" aunque se está en Caja, y el botón dice "Abrir turno tarde": caja/turno mezclados y "para vender" no aplica en Caja. |
| Q141 | U66 | confunde | arreglado | Caja › Pago a proveedor | Ambos | Sin facturas pendientes (o mientras cargan), el select solo tiene "Elegí la factura" y ningún mensaje. |
| Q142 | U67 | confunde | arreglado (T62, 22/10) | Caja › Cierre › Comprobante › Compartir | Ambos | "Compartir" sin `navigator.share` copia el texto al portapapeles en silencio (y traga el error): el usuario toca y no pasa nada visible. El diseño dice "Compartir PDF". |
| Q143 | U68 | confunde | arreglado (T62, 22/10) | Vender › Modo mostrador › barra superior | Mac | "En espera · 2" está maquetado como botón (borde, `rounded-lg`, negrita) pero es un `<span>`: clickearlo no hace nada. |
| Q144 | U69 | confunde | arreglado | Avisos › Posponer | Ambos | "Posponer" no dice por cuánto (4 h fijas) y el toast "Pospuesto: vuelve a aparecer después" tampoco. |
| Q145 | U71 | confunde | arreglado (T62, 22/10) | Ajustes › Dispositivos / › Tickets | Ambos | Dispositivos promete "Prueba de la pistola, impresora, planilla de códigos", pero la impresora ("Hay impresora de tickets", "Ancho del papel") está en Tickets. El toggle "Imprimir solo al cobrar" no explica qué pasa… |
| Q146 | U72 | confunde | arreglado (T62, 22/10) | Compras › Listas de precios | Ambos | Dos primarios a la vez tras la vista previa: "Ver qué cambia (N filas)" sigue verde arriba y aparece "Guardar costos" verde abajo. Después de guardar, "Guardar costos" sigue habilitado. |
| Q147 | U73 | confunde | arreglado (T62, 22/10) | Compras › Pedidos | Ambos | Sin acción principal: no existe "Nuevo pedido"; la única forma de armar uno es desde Sugerido o "Armar el de hoy". |
| Q148 | U74 | confunde | arreglado | Compras › Pedidos › Detalle › "Cancelar pedido" | Ambos | Ejecuta la cancelación sin confirmación ni Deshacer; un toque equivocado cancela el pedido. |
| Q149 | U75 | confunde | arreglado | Compras › Recepción (repositor, sin costos) | iPhone | Al confirmar ve solo "Recepción confirmada: entró el stock". No se le dice que el dueño completará los costos ni que los productos quedan con "Revisar precio". |
| Q150 | U78 | confunde | arreglado | Clientes y fiado › Lista | Mac | La "tabla" es una lista sin encabezados: dos montos sin rótulo (límite en gris y saldo) y el chip de estado. |
| Q151 | U79 | confunde | arreglado (T62, 22/10) | Clientes y fiado › Lista | iPhone | El chip de estado ("Vencido", "Sobre el límite", "A favor") solo se muestra en Mac; en el celular un cliente vencido se distingue solo porque el nombre va en rojo, y "· 12 días" aparece sin decir de qué. |
| Q152 | U80 | confunde | arreglado (T62, 22/10) | Clientes y fiado › Cobrar fiado › Pago registrado | Ambos | El recibo solo ofrece "Mandar por WhatsApp" y un botón genérico "Listo"; no hay imprimir ni PDF. Si el cliente no tiene teléfono, abre wa.me sin número. |
| Q153 | U81 | confunde | arreglado (T62, 22/10) | Clientes y fiado › Cobrar fiado › medios | Ambos | Los chips dicen "Transf. o QR" y "Tarjeta", pero el recibo usa "Transferencia" y "Débito"; "Tarjeta" se guarda como débito aunque sea crédito. |
| Q154 | U82 | confunde | arreglado (T62, 22/10) | Reportes › Tarjetas | iPhone | Las tarjetas muestran "…" para siempre si la consulta falla o no hay conexión (sin error ni Reintentar); no traen gráfico chico ni el selector de período que el diseño pone arriba. |
| Q155 | U83 | confunde | arreglado (T62, 22/10) | Reportes › Tablas con drill | Mac | Bajar un nivel se hace con `onClick` en `<tr>`: la fila no es foco de teclado ni tiene `role`/`tabIndex`, y no hay pista de que se puede tocar. |
| Q156 | U84 | confunde | arreglado (T62, 22/10) | Productos › Vencimientos › Devolver / Dar de baja · Conteos · Movimientos ›… | Ambos | `remove`, `save`, `submit`, `approve` y `review` no tienen `onError`: si falla, el lote sigue en la lista, el conteo no se guarda o el ajuste queda pendiente sin aviso. "Devolver" y "Dar de baja" descuentan stock con un… |
| Q157 | U85 | confunde | arreglado (T62, 22/10) | Productos › Etiquetas de góndola (vacío) | iPhone | "Elegí productos en la lista y tocá Etiquetas.", pero en el celular la lista no tiene selección múltiple ni acción "Etiquetas", y el vacío no trae botón. |
| Q158 | U87 | confunde | arreglado | Productos › Importar › Relacionar columnas | Ambos | "Reconocimos {n} de {10}" cuenta los 10 campos de Mostrador, no las columnas del archivo: con un Excel de 3 columnas dice "Reconocimos 3 de 10", como si faltaran 7. |
| Q159 | U90 | confunde | arreglado (T62, 22/10) | Compras › Recepción › Completar costos | iPhone | "Actualizar precio" es un checkbox nativo (≈13 px); "Guardar costos" queda deshabilitado sin decir por qué cuando ya no hay costos pendientes. |
| Q160 | C11 | molesta | arreglado (T63) | Vender | iPhone | `stripScanLeak` corre también con códigos de cámara (línea 237): si el buscador tenía texto cuyo último carácter coincide con el primer dígito del código ("coca 7" y un EAN que empieza en 7), lo borra. Con éxito no se… |
| Q161 | C12 | molesta | arreglado (T63) | Vender | iPhone | `focusSearch()` después de cada agregado enfoca el `input` tapado por la cámara. En iOS el foco programático no abre el teclado, pero puede desplazar la página y, al cerrar la cámara, dejar el teclado arriba tapando la… |
| Q162 | C13 | molesta | arreglado (T63) | CameraScanner | iPhone | Un solo mensaje de error para todo: permiso denegado (`NotAllowedError`), sin cámara o contexto no seguro (`NotFoundError`/`http://`), cámara ocupada por otra app (`NotReadableError`), restricciones no satisfechas… |
| Q163 | C14 | molesta | no se cambia (DECISIONS) | CameraScanner | iPhone | El recuadro guía (h-40 w-72) no corresponde a ninguna región de decodificación: ZXing analiza el cuadro completo (1920×1080) cada 100 ms con `TRY_HARDER`, y `object-cover` recorta lo visible pero no lo analizado (puede… |
| Q164 | U91 | molesta | arreglado (T63) | Todas las que usan `Tabs` (Compras, Productos › Ficha) | iPhone | Las pestañas miden `min-h-10` (40 px). |
| Q165 | U92 | molesta | arreglado (T63) | Todas las que usan `toast` con acción (Deshacer) | iPhone | El botón de acción mide `h-9` (36 px) y el toast dura 2,5 s por defecto: poco para llegar a "Deshacer". |
| Q166 | U93 | molesta | arreglado (T63) | Todas las que usan `Menu` ("Más acciones") | iPhone | El disparador mide `h-9` (36 px) y cada ítem `h-10` (40 px). |
| Q167 | U94 | molesta | arreglado (T63) | Todas las que usan `Checkbox` (Elegir tickets, Productos, Conteos) | iPhone | La casilla mide 18 px y el `<input>` es el único elemento tocable. |
| Q168 | U95 | molesta | arreglado (T63) | Aviso de versión nueva | iPhone | "Después" y "Actualizar" miden `h-10` (40 px). |
| Q169 | U96 | molesta | arreglado (T63) | Todas las que usan `NoPermission` | Ambos | Texto fijo "No tenés permiso para ver esto / Lo puede ver: Dueño o Encargado." aunque se trate de hacer algo (vender, ajustar), no de ver. Reportes dice "No hay reportes para tu rol" sin decir qué rol puede. |
| Q170 | U97 | molesta | arreglado (T63) | Ingreso con PIN › lista de personas | Ambos | Si falla la lista y no hay copia local, el único mensaje es "Este dispositivo no está habilitado. Pedile al dueño que lo habilite.", también cuando el motivo es que no hay conexión; sin Reintentar. |
| Q171 | U99 | molesta | arreglado (T63) | Avisos › filtro por tipo | Ambos | El filtro es un `<select>` cuyas opciones salen solo de los avisos ya cargados: con la lista vacía no hay tipos para elegir. "Resolver" (botón) vs "Resuelto" (toast y diseño). Vacío "No hay avisos" sin acción. |
| Q172 | U100 | molesta | arreglado (T63) | Barra superior › menú de usuario | Mac | El menú del avatar solo se cierra con click afuera; no responde a Esc (el `Menu` genérico sí). |
| Q173 | U101 | molesta | arreglado (T63) | Inicio › Accesos rápidos › "Escanear" | Mac | En la Mac el acceso abre la cámara web, y si falla dice "Revisá el permiso en Ajustes del teléfono". |
| Q174 | U102 | molesta | parcial (T63): falta el nombre de la caja en el chip | Inicio › Cabecera · Barra superior › chip de caja | Ambos | Inicio dice "Caja cerrada" como texto sin acción. El chip de Mac dice "Caja abierta · Tomás · desde 14:00" sin el nombre de la caja. |
| Q175 | U103 | molesta | arreglado (T63) | Vender › Venta › Mayor de 18 | iPhone | El aviso se cierra con un botón de texto "Listo" sin alto mínimo y con etiqueta genérica. |
| Q176 | U104 | molesta | arreglado (T63) | Vender › Historial › buscador | iPhone | "N° de venta" mide `h-9` (36 px) y `w-48` fijo. |
| Q177 | U106 | molesta | arreglado (T63) | Vender › Cobro › vuelto | Ambos | El vuelto se muestra a 32 px. |
| Q178 | U108 | molesta | arreglado (T63) | Vender › Venta (Mac) › franja de atajos y F1 | Mac | La franja dice "F9 Retiro" y el botón "Cajón" no muestra F10 (sus vecinos sí). La lista completa (F1) no incluye "↑ ↓ elegir línea" ni Enter. |
| Q179 | U109 | molesta | arreglado (T63) | Vender › Ventas en espera | Ambos | Cada venta en espera es una fila tocable sin verbo; al tocarla con una venta en curso, la actual se pone en espera sin avisar. |
| Q180 | U110 | molesta | arreglado (T63) | Vender › Venta › buscador | iPhone | Placeholder "Escaneá o buscá por nombre" y botón de cámara de 44 px. |
| Q181 | U111 | molesta | arreglado (T63) | Vender › Cobro › Transferencia o QR | Ambos | Muestra alias y CVU pero no hay "Copiar alias". |
| Q182 | U112 | molesta | arreglado (T63) | Vender › Caja cerrada | Ambos | El botón dice "Abrir turno tarde" / "Abrir turno mañana". |
| Q183 | U113 | molesta | arreglado (T63) | Vender › Historial › Detalle | Ambos | Si la venta no trae nombre de caja se muestra "Caja 1" fijo. |
| Q184 | U114 | molesta | no se cambia (DECISIONS) | Vender › Cobro › Imprimir | Ambos | Imprimir es `window.print()` sin camino de error: no existe "Impresora desconectada … Reintentar / Compartir". |
| Q185 | U115 | molesta | arreglado (T63) | Caja › Cierre › Comprobante | Ambos | Botón primario "Listo" para volver a Caja. Tres nombres para lo mismo: título "Turno cerrado", cabecera "CIERRE DE CAJA", título de share "Cierre de caja", botón "Cerrar turno…". En Historial el `<h1>` "Turno cerrado"… |
| Q186 | U118 | molesta | arreglado (T63) | Caja › Gasto | Ambos | Falta "Foto del comprobante · opcional". |
| Q187 | U119 | molesta | parcial (T63): Facturas con primaria; Recepción igual | Compras › Facturas y pagos · Recepción (inicio) | Ambos | Facturas no tiene acción principal ("Cargar comprobante" y "Registrar pago" son secundarios); Recepción tampoco ("Recibir sin pedido" y "Compra en mayorista" secundarios; "Recibir" es texto verde en la fila). |
| Q188 | U120 | molesta | arreglado (T63) | Compras › pestañas | Ambos | Seis pestañas "Sugerido · Pedidos · Proveedores · Recepción · Facturas y pagos · Listas de precios"; el diseño tiene cinco (sin "Recepción"). `/compras` abre "Pedidos" aunque la primera pestaña es "Sugerido". |
| Q189 | U121 | molesta | arreglado (T63) | Compras › filas de resultados e inputs (Pedido fijo, Lo que confirmó el proveedor,… | iPhone | Filas de resultado con `py-1.5`/`py-2` (≈32 a 40 px), inputs de cantidad `h-10` (40 px), "Cargar sin código" es texto sin alto mínimo (≈20 px). |
| Q190 | U122 | molesta | arreglado (T63) | Compras › Recepción › línea activa › "Listo" · hojas con "Guardar" a secas (Nuevo… | Ambos | Botones genéricos: "Listo" no se distingue de "Confirmar recepción"; "Guardar" en cuatro hojas distintas; "Confirmado con cambios" es un estado, no una acción. |
| Q191 | U123 | molesta | arreglado (T63) | Compras › Sugerido › resumen y acciones | Ambos | "Falta $ 23.600 para el mínimo". "Descargar PDF" y "Guardar borrador" crean un pedido en Borrador y navegan al detalle sin aviso. |
| Q192 | U124 | molesta | arreglado (T63) | Compras › Pedidos › Detalle (enviado/confirmado) · Nuevo pedido fijo | Ambos | "Marcar confirmado" es el primario y "Recibir mercadería" secundario; el diseño pone "Recibir mercadería" en verde. Los chips "lun … sáb" no tienen etiqueta ni `legend`. |
| Q193 | U125 | molesta | arreglado (T63) | Compras › Recepción › Confirmar · Listas de precios | Ambos | "Confirmar recepción" es `size="lg"` inline al final; el diseño lo muestra en barra fija de 56 px. Listas de precios es un formulario único, no un asistente por pasos, y la vista previa no dice el promedio. |
| Q194 | U126 | molesta | arreglado (T63) | Clientes y fiado › buscador · Ajustes › buscador | iPhone | Los buscadores miden `h-10` (40 px); el de Ajustes dice "Buscar" y el diseño "Buscar un ajuste". |
| Q195 | U127 | molesta | arreglado (T63) | Clientes y fiado (Mac, con ficha abierta) | Mac | Dos primarios a la vez: "Nuevo cliente" en el encabezado y "Cobrar fiado" en el panel. |
| Q196 | U128 | molesta | arreglado (T63) | Clientes y fiado › Ficha | Ambos | Volver dice "← Clientes" con flecha tipográfica (Reportes y Ajustes usan chevron y el nombre del módulo, que es "Clientes y fiado"). "PDF" es un botón con sustantivo suelto; "Cobrar fiado" deshabilitado sin explicar por… |
| Q197 | U129 | molesta | arreglado (T63) | Reportes › textos y gráficos | Ambos | "vs. el período anterior" en la tarjeta y "contra el período anterior" en el reporte. Etiquetas de barras y mapa de calor en 11 px. "Borrar" un gasto fijo sin confirmar ni `onError`. |
| Q198 | U130 | molesta | parcial (T63): falta el estado por requisito en Facturación | Ajustes › Cajas · Dispositivos · Facturación · Usuarios | Ambos | "Agregar caja" (diseño y spec: "Agregar puesto de cobro"). "Este dispositivo" viene precargado "Mac del mostrador" aunque se abra desde el iPhone. "Próximamente" se repite como subtítulo y título; falta "Revisar IVA de… |
| Q199 | U131 | molesta | arreglado (T63) | Avisos › Notificaciones (push) | Ambos | Si faltan las claves, el toast dice "El servidor todavía no tiene las claves de notificaciones (VAPID)." |
| Q200 | U132 | molesta | parcial (T63): secciones apiladas, leyenda y % del último cambio; el pie sigue Ajustar stock · Editar | Productos › Ficha | Ambos | Pestañas General/Precio/Stock/Proveedores/Historial también en el celular (el spec pide secciones apiladas). El pie de Mac termina en "Ajustar stock" y "Editar" (el diseño: "Sumar al pedido" y "Editar precio"). El… |
| Q201 | U133 | molesta | arreglado (T63) | Productos › Lista y Ficha › chip de stock · Ficha rápida | Ambos | Chip "Bajo · 3 / 8": el 8 no dice qué es. En la ficha rápida el stock en 0 o negativo se marca solo con rojo, sin palabra ni ícono. |
| Q202 | U134 | molesta | abierto: sin deslizar, conteos en filtros ni filtro por categoría y proveedor | Productos › Lista | Ambos | Las tarjetas no tienen "deslizar para acciones"; los chips de filtro no muestran conteo; faltan filtros por categoría y proveedor, y el orden. |
| Q203 | U136 | molesta | arreglado (T63) | Productos › Movimientos › Ajustes para aprobar | Ambos | Un botón primario "Aprobar" por cada ajuste pendiente: varias acciones principales a la vez. |
| Q204 | U137 | molesta | parcial (T63): faltan la fuente por categoría o proveedor en Etiquetas y la foto en Ajustar stock | Productos › Cambio masivo · Importar · Etiquetas · Planilla · Cambiar categoría · Ajustar… | Ambos | Nombres distintos del diseño: chips "% al precio / % al costo / Recalcular desde el costo" y "Confirmar N precios" (diseño: "Aplicar un % al costo…", "Aplicar N precios nuevos"); menú "Importar desde Excel" vs pantalla… |
| Q205 | U138 | molesta | arreglado (T63) | Productos › Vencimientos, Movimientos, Conteos, Promociones › chips de estado | Ambos | Los chips "Vence 12/10", "Ajuste · para aprobar", "Para revisar", "Activa" van solo con color y palabra, sin ícono. "Dar de baja" (botón) vs "Dado de baja como merma" (aviso) vs "Merma" (diseño y motivo de ajuste). |
| Q206 | U139 | molesta | arreglado (T63) | Productos › Nueva promoción | Ambos | Los chips "dom … sáb" no tienen etiqueta visible (solo `aria-label="Días"`); "Nueva promoción" vs diseño "Nueva promo". |
| Q207 | U143 | molesta | arreglado (T63) | Ajustes (cualquier rol sin permiso) · Vender › Historial (repositor) · Productos ›… | Ambos | La pantalla pide los datos antes de mirar el permiso: Ajustes hace `GET /api/settings` cuatro veces por pantalla y recibe 403 (el hook corre antes del guard); Historial de ventas con el repositor da ocho 403 y Conteos… |

