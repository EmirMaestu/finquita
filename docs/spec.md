# Mostrador — Especificación para Claude Design

Oct 4, 2026 · @Emir

## Resumen y decisiones

Mostrador es una app web para manejar un almacén, kiosco o minimarket de un solo local: vender, controlar stock, manejar la caja, pedirle a proveedores por WhatsApp y seguir el negocio desde el celular. Cada pantalla de este spec se diseña en dos versiones, celular y compu. "Mostrador" es un nombre de trabajo.

| Tema | Decisión para v1 |
| --- | --- |
| Rubro | Almacén, kiosco o minimarket: códigos de barras, productos por peso, vencimientos y fiado |
| Escala | Un local con uno o más puestos de cobro. Sin sucursales |
| Bot de WhatsApp | Fase 2. En v1 el pedido se manda con un botón que abre WhatsApp con el pedido escrito, y los avisos llegan por notificación push |
| Facturación ARCA | Fase 2. En v1 se emite ticket no fiscal y la UI deja reservado el lugar de la factura |
| Plataforma | PWA instalable, sin pasar por la App Store. Mostrador: la Mac del local con Chrome y una pistola lectora USB. Dueños: iPhone |
| Productos por peso | No hay balanza etiquetadora: se venden con botones con foto y un teclado de peso |
| Carga de productos | Se arranca vendiendo: lo que no está cargado se da de alta al escanearlo, con la pistola o la cámara |

Principios que guían cada pantalla:

1. Nada frena una venta: escanear, cobrar y seguir en menos de 5 segundos, aun sin internet.
2. Pistola y teclado en el mostrador, pulgar en el iPhone.
3. La plata siempre clara: montos grandes, formato argentino ($ 12.345,50) y color solo cuando significa algo.
4. Todo deja rastro: cada movimiento de stock y de caja guarda quién, cuándo y por qué.
5. El sistema propone, la persona confirma: pedidos, cambios de precio y ajustes nunca se ejecutan solos.
6. Lenguaje de almacén y voseo: fiado, faltantes, arqueo, merma, "Abrí la caja".
7. Simple primero: cada pantalla muestra su acción principal; promociones, lotes, conteos y varias cajas arrancan apagados.

## Usuarios y permisos

Cuatro roles cubren un almacén de un local. La matriz es el punto de partida: el dueño puede prender o apagar cada permiso por persona.

| Rol | Qué hace | Dónde trabaja |
| --- | --- | --- |
| Dueño | Decide precios, compras y plata. Ve todo | Celular casi siempre; compu para tareas masivas |
| Encargado | Reemplaza al dueño en el día a día | Compu del mostrador y celular |
| Cajero | Vende, cobra y cierra su turno | Compu o tablet del mostrador |
| Repositor | Recibe mercadería, cuenta stock, controla vencimientos | Celular |

Matriz de permisos. "PIN" = el sistema pide en el momento el PIN de un encargado o del dueño.

| Acción | Dueño | Encargado | Cajero | Repositor |
| --- | --- | --- | --- | --- |
| Vender y cobrar | Sí | Sí | Sí | No |
| Descuento hasta el tope configurado | Sí | Sí | Sí | No |
| Descuento por encima del tope | Sí | Sí | PIN | No |
| Anular venta o hacer devolución | Sí | Sí | PIN | No |
| Abrir el cajón sin venta | Sí | Sí | PIN | No |
| Abrir y cerrar su turno de caja | Sí | Sí | Sí | No |
| Retiros y gastos de caja | Sí | Sí | PIN | No |
| Fiado dentro del límite del cliente | Sí | Sí | Sí | No |
| Fiado por encima del límite o con deuda vencida | Sí | Sí | PIN | No |
| Ver costos y márgenes | Sí | Opcional | No | No |
| Cambiar precios | Sí | Sí | No | No |
| Ajustar stock (merma, rotura, vencido) | Sí | Sí | No | Queda para aprobar |
| Contar stock y recibir mercadería | Sí | Sí | Opcional | Sí |
| Armar pedidos a proveedores | Sí | Sí | Anota faltantes | Anota faltantes |
| Enviar pedidos por WhatsApp | Sí | Opcional | No | No |
| Reportes | Todos | Sin rentabilidad, salvo permiso de costos | Solo su turno | No |
| Ajustes y usuarios | Sí | No | No | No |
| Consultas al bot de WhatsApp (fase 2) | Todo | Lo mismo que ve en la app | Stock, precios, vencimientos y faltantes | Stock, precios, vencimientos y faltantes |

Patrones de UI que salen de esta matriz:

- **Autorización con PIN.** Una acción marcada PIN abre un teclado numérico superpuesto: "Autorizá con tu PIN". Queda registrado quién pidió y quién autorizó.
- **Cambio rápido de usuario.** La compu del mostrador no cierra sesión: se toca el avatar, se elige la persona y se tipea su PIN. Se bloquea sola tras unos minutos sin uso.
- **Lo que no ves, no aparece.** Costos y márgenes no se muestran a quien no tiene permiso. Las acciones con PIN se muestran con un candado, no se esconden.
- **Ingreso.** Dueño y encargado entran con email y contraseña (o Google), con huella o rostro en el celular. Cajero y repositor entran con su PIN en dispositivos que habilitó el dueño.

## Navegación

Ocho módulos en v1 (WhatsApp llega en fase 2), con la misma estructura en celular y en compu; lo que cambia es cómo se llega a cada uno.

&#91;embedded content: mapa de pantallas · 9 módulos en 3 grupos\]

Los módulos con punto van en la barra inferior del celular; en compu, todos están en la barra lateral.

Las pantallas de cada módulo:

| Grupo | Módulo | Pantallas |
| --- | --- | --- |
| Mostrador | Inicio | Panel del día, avisos, primeros pasos |
| Mostrador | Vender | Venta, cobro, venta lista y ticket, ventas en espera, historial de ventas, devolución y anulación |
| Mostrador | Caja | Abrir turno, turno en curso, retiro, gasto e ingreso, arqueo y cierre, historial de cierres |
| Mercadería | Productos | Lista y ficha, alta rápida, importar, cambio masivo de precios, etiquetas, movimientos, ajuste, conteo, vencimientos, promociones, categorías |
| Mercadería | Compras | Proveedores, pedido sugerido, pedidos, pedido fijo, recepción, facturas y pagos, lista de precios |
| Mercadería | WhatsApp | Fase 2: bandeja, plantillas, contactos autorizados, automatizaciones, conexión |
| Gestión | Clientes y fiado | Lista y saldos, ficha y cuenta corriente, cobrar fiado |
| Gestión | Reportes | Ventas, rentabilidad, stock, caja, compras, fiado, resultado del mes |
| Gestión | Ajustes | Negocio, usuarios, cajas, medios de pago, precios y stock, dispositivos, tickets, avisos, facturación (fase 2), datos, actividad |

**Celular: barra inferior de cinco lugares.**

| Lugar | Abre | Por qué ahí |
| --- | --- | --- |
| Inicio | Panel del día | Es lo primero que mira el dueño |
| Vender | Punto de venta | Kioscos que cobran con el celular; no aparece si el rol no vende |
| Productos | Catálogo y stock | Consultar precio y stock es el uso más frecuente |
| Compras | Pedidos, recepción, proveedores | Reposición y llegada de mercadería |
| Más | Caja, Clientes, Reportes, Ajustes | Uso menos frecuente o de un solo rol |

- **Escanear** vive fijo en la barra superior. Abre la cámara y actúa según dónde estés: agrega a la venta, abre el producto o marca la recepción.
- Escaneado desde cualquier otro lado, muestra una ficha rápida: precio, stock y botones Vender, Ajustar y Agregar al pedido.
- Arriba también van la campana de avisos y un chip con el estado de la caja.
- Los detalles se abren a pantalla completa; las acciones cortas, en hojas que suben desde abajo.

**Compu: barra lateral colapsable con los nueve módulos.**

- Barra superior con búsqueda global, chip de caja ("Caja abierta · Tomás · desde 14:00"), estado de conexión, campana y usuario.
- **Modo mostrador:** Vender ocupa toda la pantalla, sin barra lateral. Pensado para monitor de 15" a 24" con lector y teclado.
- Los detalles (producto, venta, pedido) se abren en un panel a la derecha, sin perder la lista.
- **Tablet** (600 a 1023 px), en vertical: riel de íconos a la izquierda y Vender como en celular, con más botones rápidos. Apaisada, usa el diseño de compu.

**Búsqueda global** (Ctrl+K o la lupa): encuentra productos por nombre, código de barras o código interno; clientes; proveedores; ventas por número; y acciones como "cerrar caja" o "cambiar precios".

**Atajos en Vender.** Una franja inferior muestra los principales; F1 abre la lista completa. Con ↑ y ↓ se elige la línea a la que aplican +, − y Supr. La app captura las teclas F aunque el navegador tenga atajos propios, y Ctrl + Enter también cobra.

| Tecla | Acción |
| --- | --- |
| F2 | Buscar producto por nombre |
| F3 | Producto varios, a precio libre |
| F4 | Descuento |
| F5 | Asignar cliente o fiado |
| F6 | Poner en espera o recuperar una venta |
| F9 | Retiro o gasto de caja |
| F10 | Abrir el cajón |
| F12 | Cobrar |
| \* | Multiplicar: "3 \*" y escanear agrega tres |
| + y − | Sumar o restar uno al ítem elegido |
| Supr | Quitar el ítem elegido |
| Esc | Cancelar o cerrar |

## Requisitos transversales

Estas reglas valen para todas las pantallas y cambian cómo se diseñan.

**Sin internet, el mostrador sigue vendiendo.**

- Catálogo, precios y clientes quedan guardados en el dispositivo. Las ventas se encolan y se sincronizan solas al volver la conexión.
- Un chip en la barra superior lo dice: "Sin conexión · 3 ventas por sincronizar". Al volver: "Todo sincronizado".
- Lo que necesita internet (mandar pedidos por WhatsApp, reportes del mes) se ve deshabilitado y explica por qué. Nunca falla en silencio.
- Si dos dispositivos venden la última unidad, el stock queda negativo, se marca en rojo y aparece en avisos para revisar.

**Hardware del mostrador.**

| Dispositivo | Conexión | Qué implica en la UI |
| --- | --- | --- |
| Pistola lectora (láser o imager) | USB; funciona como teclado y no necesita drivers | La app la reconoce por la velocidad de tipeo: en Vender se escanea sin hacer clic en el buscador. Mejor con soporte de mesa |
| Cámara del iPhone | Librería JS de lectura de códigos (por ejemplo ZXing), porque Safari no trae habilitado el lector nativo ([caniuse](https://caniuse.com/mdn-api_barcodedetector)) | Escaneo continuo con pitido y aviso "Agregado: Yerba 1 kg" |
| Balanza actual del local | Sin conexión | El peso se tipea en el teclado de peso. Más adelante, una balanza con salida USB o serie se puede leer desde Chrome en la Mac (Web Serial) |
| Impresora térmica (opcional) | Tickets de 58 u 80 mm | Sin impresora, la venta se guarda igual y el ticket se comparte. Si falla, se ofrece reimprimir |
| Cajón de dinero (opcional) | Se abre desde la impresora | Sin impresora, cajón manual. Abrirlo sin venta pide PIN |
| Posnet, QR o billetera | Sin integración en v1 | El cajero elige el medio y confirma el cobro a mano |

**Qué se hace en cada dispositivo.**

| Dispositivo | Quién | Para qué |
| --- | --- | --- |
| Mac del local, con Chrome y la app instalada | Cajero y encargado | Vender, cobrar, caja y cargar productos con la pistola |
| iPhone de los dueños, con la PWA en la pantalla de inicio | Dueños | Ver el día, cambiar precios, cargar productos con la cámara, recibir mercadería y pedidos |
| Celular del repositor, si hay | Repositor | Recepción, conteos y vencimientos |

- **La Mac.** Desde Chrome 151 (julio de 2026), Chrome pide macOS 13 Ventura o posterior; en un macOS anterior sigue andando, pero sin actualizaciones ([9to5Google](https://9to5google.com/2026/01/23/google-chrome-ending-support-for-macos-monterey-in-july-2026/)). La app tiene que funcionar con el Chrome que tenga esa Mac.
- **Los iPhone.** La PWA se agrega a la pantalla de inicio desde Safari; las notificaciones push solo funcionan instalada así. La confirmación de escaneo es un pitido y un aviso en pantalla.

**Todo deja rastro.** Cada venta, anulación, ajuste de stock, cambio de precio y movimiento de caja guarda usuario, dispositivo, fecha y hora, valor anterior y nuevo. Se ve en la pestaña Historial de cada ficha y en Ajustes > Actividad.

**Avisos por dos canales en v1,** configurables por tipo y por rol: campana en la app y notificación push en el celular; el bot de WhatsApp se suma en fase 2. Tipos: stock bajo, vencimientos, diferencia de caja al cerrar, pedido confirmado o sin respuesta, factura de proveedor por vencer, fiado vencido, venta anulada, stock negativo y ajustes por aprobar.

**Formatos argentinos.** Pesos con punto de miles y coma decimal ($ 12.345,50); fechas dd/mm/aaaa; hora de 24 h; peso en kg con tres decimales (0,350 kg); horario de Argentina.

**Velocidad.** Buscar un producto y sumarlo a la venta tiene que sentirse instantáneo, aun con 10.000 productos cargados.

## Módulo Inicio

En cinco segundos el dueño sabe cómo viene el día y qué necesita atención.

**Panel del día,** bloques en este orden:

1. Encabezado: saludo, fecha y estado de la caja ("Caja abierta por Tomás desde 14:00").
2. Números del día: ventas en $ y % contra el mismo día de la semana pasada, tickets, ticket promedio, efectivo en caja y margen bruto estimado (solo dueño).
3. Requiere atención: lista ordenada por urgencia. Cada ítem lleva ícono, un texto concreto y un botón de acción:
   - 12 productos debajo del mínimo → Armar pedidos
   - 5 productos vencen en 7 días → Ver
   - Pedido a Distribuidora Andina enviado hace 26 h, sin confirmar → Marcar respuesta
   - Factura de Lácteos del Sur vence mañana, $ 184.500 → Registrar pago
   - Cierre de ayer con diferencia de −$ 800 → Ver arqueo
   - 3 clientes con fiado vencido, $ 46.800 → Ver
4. Accesos rápidos: Nueva venta, Escanear, Recibir mercadería, Nuevo pedido, Registrar gasto y Cambiar precios.
5. Ventas por hora: barras de hoy contra el promedio del mismo día en las últimas cuatro semanas.
6. Medios de pago del día: una barra apilada con efectivo, débito, QR, transferencia, crédito y fiado.
7. Lo más vendido hoy (top 5) y las entregas de proveedores esperadas para hoy y mañana.

**Avisos.** Centro de notificaciones con filtros (sin leer, por tipo). Cada aviso lleva a su pantalla y se puede posponer o dar por resuelto.

**Primeros pasos.** Mientras no hay datos, una checklist reemplaza al panel: cargá tus productos (Excel o escaneando), configurá medios de pago, sumá a tu equipo, agregá proveedores, conectá WhatsApp y abrí la primera caja. Con barra de progreso.

**Variantes por rol.** El cajero no ve el panel: entra directo a Vender con el resumen de su turno. El repositor ve "Tus tareas": conteos asignados, recepciones esperadas y vencimientos a revisar. El encargado ve el panel sin margen, salvo que tenga permiso de ver costos.

**Celular y compu.**

- Celular: una columna. Los números van en una grilla de dos columnas, "Requiere atención" justo debajo y los accesos rápidos en una grilla de 3 × 2.
- Compu: números en una fila arriba; debajo, atención y accesos a la izquierda y gráficos a la derecha.

**Estados.** Cargando: esqueletos. Sin conexión: los números muestran "Actualizado 10:42". Sin ventas todavía: "Todavía no hay ventas hoy" y, si la caja está cerrada, el botón Abrir caja.

## Módulo Vender

Es la pantalla más usada: escanear, cobrar y quedar lista para el próximo cliente en menos de cinco segundos.

**Pantalla de venta.**

- **Modo simple (por defecto).** Tres cosas en pantalla: la lista de lo que se lleva el cliente, los botones con foto de lo que no tiene código y un botón grande Cobrar con el total. Espera, cliente y descuentos quedan en un menú Más.
- **Mac del mostrador, dos paneles.** Izquierda, 65 %: buscador (la pistola escanea sin tocarlo), líneas del ticket (producto, cantidad, precio unitario, subtotal) y la grilla de botones de lo que no tiene código: pan, fiambres, quesos, verdura, huevos sueltos. Derecha, 35 %: total grande, promociones aplicadas, cliente asignado y Cobrar (F12) como botón dominante. Arriba, el turno: cajero y caja.
- **iPhone.** Buscador con botón de cámara arriba; líneas en lista con stepper − / + y deslizar para quitar; una fila de botones rápidos; barra fija abajo: "4 ítems · $ 18.550 · Cobrar".

**Cómo se comportan las líneas.**

- Escanear dos veces el mismo producto suma cantidad; no repite la línea.
- Tocar una línea abre cantidad, descuento por ítem, precio (con permiso) y nota.
- Pesables (no hay balanza etiquetadora): se toca su botón, o se escanea su código en la planilla, y un teclado pide el peso que marca la balanza (235 = 0,235 kg), con atajos de 100 g, ¼ kg y ½ kg. Modo por plata: "$ 2.000 de queso" → "Cortá 148 g".
- Producto varios (F3): monto, descripción opcional y categoría, para lo que no está cargado.
- Código desconocido: "El código 7790895000782 no está cargado", con dos salidas: Crear producto rápido o Vender como varios.
- Las promociones (2×1, 3×2, segunda unidad al 50 %, combos) se aplican solas y se ven como línea propia: "Promo 2×1 Coca-Cola 2,25 L −$ 4.600".
- Stock en cero: aviso que no bloquea, "Sin stock según el sistema. ¿Vender igual?". El stock queda negativo y se avisa. En Ajustes se puede exigir PIN.
- Productos para mayores de 18 (alcohol, cigarrillos): recordatorio de pedir documento, configurable por categoría.
- Envases retornables: si el cliente no trae el envase, se cobra como línea aparte; si lo devuelve, se descuenta.

**Ventas en espera (F6).** Se estaciona una venta para atender a otro cliente. Una pestaña muestra las que esperan, con hora y total.

**Cobro** (F12; hoja en celular, ventana en compu).

- Total grande arriba y cuatro botones grandes: Efectivo, Tarjeta, Transferencia o QR, y Fiado.
- Pago combinado: "$ 10.000 en efectivo + resto con débito". El saldo que falta se ve siempre.
- Efectivo: billetes rápidos ($ 1.000, $ 2.000, $ 10.000, $ 20.000, Justo) y teclado. El vuelto aparece en grande.
- Recargos o descuentos por medio de pago (por ejemplo, crédito +10 %) se muestran como línea antes de confirmar.
- Transferencia o QR: muestra alias, CVU y el QR fijo del local, y pide tildar "Verificada en el banco" antes de confirmar, para no entregar contra una captura falsa.
- Tarjeta: un toque elige débito o crédito; el cobro en el posnet se confirma a mano.
- Fiado: muestra saldo actual, límite y saldo después de esta compra. Si se pasa del límite o el cliente tiene deuda vencida, pide PIN.
- Comprobante: Ticket no fiscal por defecto. "Factura electrónica" aparece deshabilitada con la etiqueta Próximamente.
- Salida: Imprimir (si hay impresora), Compartir (PDF por la hoja de compartir del dispositivo) o Sin ticket.

**Venta lista.** Confirmación grande durante dos segundos: "Venta 004187 · $ 18.550 · Vuelto $ 1.450". Abre el cajón si hubo efectivo y hay cajón conectado y vuelve sola a una venta nueva, o antes con cualquier tecla.

**Ticket** en 58 y 80 mm: nombre y logo, dirección, fecha y hora, número, cajero, ítems (cantidad × precio y subtotal), promociones, total, medios de pago, vuelto y la leyenda "Documento no válido como factura". En fase 2, la factura B suma el bloque de transparencia fiscal: leyenda de la Ley 27.743 e IVA contenido ([fuente](https://contadoresenred.com/transparencia-fiscal-preguntas-frecuentes/)).

**Historial de ventas.** Lista con filtros (fecha, cajero, medio de pago, estado) y búsqueda por número. El detalle muestra ítems, pagos, cliente e historial, y permite reimprimir, compartir, devolver o anular.

**Devoluciones y anulaciones.**

- Devolución desde un ticket: ítems y cantidades, motivo (vencido, fallado, cambio, error de cobro) y forma de devolver (efectivo, mismo medio o saldo a favor del cliente).
- Se indica si el producto vuelve a la góndola o va a merma.
- Anular una venta completa pide motivo y PIN. Queda visible como Anulada; nunca se borra.

**Estados.** Caja cerrada: un aviso bloquea la venta y ofrece Abrir caja. Sin conexión: se vende igual y el chip cuenta las ventas por sincronizar. Impresora desconectada: aviso con Reintentar; la venta ya está guardada.

## Módulo Caja

La caja se cuadra al final de cada turno: el sistema sabe cuánto efectivo debería haber y el cajero lo cuenta sin verlo.

Cada puesto de cobro es una caja (Caja 1 por defecto). Un turno va de la apertura al cierre de una persona; puede haber turno mañana y turno tarde. Toda venta en efectivo entra a un turno abierto: si el dueño cobra desde el celular, elige la caja abierta o abre la suya.

**Abrir turno.** Se cuenta el fondo inicial por billete o se tipea el total. Se compara con lo que dejó el turno anterior ("Lucía dejó $ 20.000 de cambio"); si no coincide, pide un comentario.

**Turno en curso.** El efectivo esperado va grande, con su cuenta a la vista:

| Concepto | Monto |
| --- | --- |
| Fondo inicial | $ 20.000 |
| Ventas en efectivo | + $ 98.400 |
| Cobros de fiado en efectivo | + $ 8.000 |
| Gasto: artículos de limpieza | − $ 4.500 |
| **Efectivo esperado** | **$ 121.900** |

- Debajo, un resumen por medio de pago (efectivo, débito, crédito, QR, transferencia, fiado) con monto y cantidad de operaciones.
- Y la lista de movimientos en orden cronológico, cada uno con chip de tipo: Venta, Devolución, Retiro, Gasto, Ingreso, Cobro de fiado, Pago a proveedor.

**Movimientos manuales** (F9 en el mostrador). Todos piden motivo; el cajero necesita PIN.

- Retiro: efectivo que se lleva el dueño o va a la caja fuerte.
- Gasto: categoría (limpieza, flete, mantenimiento, adelanto de sueldo, otros), monto, nota y foto del comprobante opcional.
- Ingreso: cambio que trae el dueño.
- Pago a proveedor en efectivo: se elige la factura pendiente y queda pagada en Compras.

**Arqueo y cierre.**

1. Conteo ciego: el cajero cuenta el efectivo sin ver el esperado. Una fila por denominación con stepper y subtotal en vivo.
2. Otros medios: total de cupones del posnet (débito y crédito) y de QR y transferencias según la app del banco, contra lo registrado.
3. Resultado por medio de pago: sobrante en verde, faltante en rojo, siempre con signo. Por encima de la tolerancia (por ejemplo $ 500) el comentario es obligatorio.
4. Cuánto queda de fondo para el próximo turno y cuánto se retira.
5. Cierre: comprobante para imprimir o compartir. El dueño recibe una notificación: "Cierre turno tarde (Tomás): ventas $ 236.800, efectivo contado $ 120.700, diferencia −$ 1.200".

**Historial de cierres.** Lista por fecha con turno, cajero, ventas y diferencia en color. El detalle es el comprobante de cierre. Una vista "Día completo" suma los turnos para el dueño.

**Celular y compu.** En compu, movimientos a la izquierda y resumen a la derecha. En celular, el resumen arriba y los movimientos debajo; el conteo por billete usa steppers grandes, cómodos con el pulgar.

**Estados.** Sin turno abierto: "La caja está cerrada" y Abrir turno. Turno abierto hace más de 14 h: "¿Te olvidaste de cerrar?". Diferencia fuera de tolerancia: rojo, comentario obligatorio y aviso al dueño.

## Módulo Productos y stock

Cada producto sabe cuánto cuesta, a cuánto se vende, cuánto queda y cuándo vence. Los precios se cambian en masa porque los costos cambian seguido.

**Datos de la ficha.** Para fijar precios la UI habla de "ganancia sobre costo", como se dice en el mostrador; los reportes usan margen sobre precio.

| Dato | Ejemplo | Nota |
| --- | --- | --- |
| Nombre y presentación | Yerba Playadito 1 kg |  |
| Categoría | Almacén > Infusiones | Dos niveles |
| Tipo | Producto o servicio | Los servicios (recargas cobradas en terminales externas) no llevan stock y registran la comisión |
| Códigos de barras | 7791234000012 | Admite varios por producto |
| Código interno o PLU | 1042 | Para pesables y botones rápidos; va en la planilla de códigos |
| Unidad de venta | Unidad, kg o 100 g | Marca si es pesable |
| Unidad de compra | Caja × 12 | Se compra por bulto y se vende por unidad |
| Presentaciones vinculadas | Maple × 30 y huevo suelto | Comparten el mismo stock |
| Costo | $ 4.850 | Último y promedio, por proveedor |
| Ganancia y precio | 42 % → $ 6.900 | Redondeo a $ 10, $ 50 o $ 100 |
| Precio fijo | Cigarrillos | Queda afuera del cambio masivo de precios |
| IVA | 21 % o 10,5 % | Se guarda para la fase 2 |
| Stock y mínimo | 3 / 8 | Debajo del mínimo, avisa y entra al pedido sugerido |
| Envase retornable | Cerveza 1 L | Se cobra aparte si el cliente no trae el envase |
| Ubicación | Góndola 3 |  |
| Vencimientos | Por lote | Se activa por producto o por categoría |
| Proveedores | Distribuidora Andina, código YPL-1K | Uno principal y alternativos |
| Restricción | Mayores de 18 | Alcohol y cigarrillos |
| Foto |  | Opcional |

**Pantallas.**

1. **Lista de productos.** Buscador, filtros (categoría, proveedor, stock bajo, sin stock, negativo, por vencer, precio sin tocar hace más de 30 días, inactivos) y orden. En compu, tabla: producto, código, stock con estado, costo, ganancia, precio y última actualización. Selección múltiple para cambiar precio, cambiar categoría, imprimir etiquetas o sumar al pedido. En celular, tarjetas con nombre, precio grande y chip de stock; deslizar para acciones.
2. **Ficha.** Pestañas General, Precio, Stock, Proveedores e Historial, con un gráfico de costo y precio en el tiempo. En celular, secciones apiladas.
3. **Alta rápida.** Desde un código desconocido: nombre, precio y categoría; stock inicial opcional. Diez segundos y sigue la venta. Para cargar en serie, Modo carga: pistola en la Mac o cámara en el iPhone, el código ya aparece puesto, nombre, precio, Enter y el siguiente. Si el código está en Open Food Facts, nombre y foto se completan solos (la base es abierta, pide identificar la app y permite 15 consultas por minuto).
4. **Importar desde Excel.** Asistente: subir archivo → relacionar columnas → vista previa (nuevos, actualizados, con error) → confirmar.
5. **Cambio masivo de precios.** Filtrar por proveedor, categoría o marca → aplicar un % al costo o al precio, o recalcular desde el costo → elegir redondeo → vista previa con antes, después y ganancia resultante → confirmar → ofrecer imprimir las etiquetas de lo que cambió. Los productos con precio fijo quedan afuera.
6. **Etiquetas de góndola.** Elegir productos (o "los que cambiaron hoy") y plantilla: tamaño, precio grande, precio por kg o litro y código de barras. Vista previa en hoja A4 o en impresora de etiquetas. También imprime la planilla de códigos: una hoja con el código interno de cada producto sin código de barras, para escanearlo con la pistola.
7. **Movimientos de stock.** Por producto o general: fecha, tipo (venta, recepción, ajuste, merma, devolución, conteo), cantidad con signo, stock resultante, usuario y referencia.
8. **Ajuste de stock.** Producto, cantidad que entra o sale (o el stock real), motivo (merma, rotura, vencido, faltante, consumo interno, error de carga), nota y foto opcional. Lo que carga el repositor queda pendiente de aprobación.
9. **Conteo de inventario.** Se crea total, por categoría o por góndola, y se asigna a alguien. En celular, modo conteo: escáner, teclado de cantidad, contador "48 de 120" y conteo ciego. En compu, la revisión: diferencias en unidades y en $, aprobar todo o por línea.
10. **Vencimientos.** Lista por fecha (vencidos, en 7 días, en 30 días) con lote y cantidad. Acciones: poner en oferta, dar de baja como merma o devolver al proveedor.
11. **Promociones.** Lista por estado (activa, programada, terminada). Al crear: tipo (2×1, 3×2, enésima unidad al X %, % por categoría, combo a precio fijo, día de la semana), productos, vigencia y días.
12. **Categorías.** Árbol de dos niveles, con ganancia por defecto en cada categoría.

**Estados.** Catálogo vacío: tres caminos grandes: empezar a vender (lo que no está se carga al escanearlo), Modo carga e importar Excel. Sin costo: chip "Sin costo" y la ganancia no se calcula. Precio debajo del costo: chip rojo "Pierde plata". Costo actualizado en una recepción sin tocar el precio: chip "Revisar precio".

## Módulo Proveedores y compras

El sistema calcula qué falta, arma el pedido por proveedor y lo sigue hasta que la mercadería está en la góndola y la factura pagada.

Un almacén compra por tres canales y la UI soporta los tres:

- **Distribuidor o preventista:** el pedido sale por WhatsApp con un botón que abre el chat del proveedor (enlace wa.me) con el pedido escrito, y el PDF para adjuntar. El bot que lo automatiza es fase 2.
- **Mayorista donde va el dueño:** sin pedido previo; se registra directo la recepción como "Compra en mayorista".
- **Reparto diario (pan, lácteos):** pedido fijo que se repite y se ajusta con un toque.

**Pantallas.**

1. **Proveedores.** Lista con rubro, días de pedido y de entrega, WhatsApp, saldo a pagar y último pedido. Ficha: datos (razón social, CUIT, contacto, WhatsApp, email), condiciones (día de pedido, día de entrega, pedido mínimo, plazo de pago), canal (WhatsApp, manual o mayorista), productos con código y costo del proveedor, pedidos, facturas y saldo.
2. **Pedido sugerido.** Por proveedor, los productos debajo del mínimo o que no llegan a la próxima entrega. Columnas: stock, venta diaria promedio (últimos 28 días), sugerido en unidades y en bultos, costo y subtotal; cantidades editables. Total contra el pedido mínimo. Acciones: Enviar por WhatsApp, Guardar borrador, Descargar PDF.
3. **Pedidos.** Lista por estado: Borrador, Enviado, Confirmado (o con cambios), Recibido parcial o total, Cerrado y Cancelado. En v1, Confirmado se marca a mano cuando el proveedor responde. El detalle pone lado a lado lo pedido, lo confirmado y lo recibido, con línea de tiempo y notas.
4. **Pedido fijo.** Para el reparto diario: una lista que se repite cada día o semana y se ajusta antes de mandarla.
5. **Recepción de mercadería,** pensada para celular. Desde un pedido o sin pedido. Se escanea cada producto y se tipea la cantidad, viendo pedido contra recibido. Se marcan faltantes, sobrantes y dañados; lote y vencimiento en perecederos; foto del remito o la factura. Si el costo cambió: "El costo subió 12 %", con el precio nuevo sugerido y el botón Actualizar precio. Quien no ve costos carga solo cantidades; el encargado o el dueño completa los costos y el producto queda con el chip "Revisar precio". Al confirmar entra el stock, se actualizan costos y se genera la cuenta a pagar.
6. **Facturas y pagos.** Facturas y remitos con fecha, monto, vencimiento y estado (pendiente, vencida, pagada parcial, pagada). Registrar pago con efectivo de la caja, transferencia u otro medio, con comprobante. Agenda de vencimientos de la semana, saldo por proveedor y notas de crédito por devoluciones.
7. **Lista de precios del proveedor.** Importar su Excel, relacionar sus códigos con los productos, indicar si los costos vienen con o sin IVA y con qué bonificación, ver qué costos cambian y cuánto, y saltar al cambio masivo de precios.

**Cómo se calcula el sugerido.** Cada cantidad explica su cuenta al tocarla, en palabras.

```latex
\text{pedido} = \text{venta diaria} \times \text{días a cubrir} - \text{stock} - \text{ya pedido}
```

Días a cubrir: desde hoy hasta que llegue el pedido siguiente a este, más los días de reserva. El resultado se redondea al bulto. Ejemplo que muestra la UI: "Vendés 3 por día · tiene que alcanzar 11 días · necesitás 33 · tenés 9 → pedí 24, 2 cajas de 12".

**Celular y compu.** Recepción y pedido sugerido se usan con el pulgar en celular. En compu, el sugerido es una tabla editable con teclado (Tab y Enter). Facturas y listas de precios son tareas de compu. En celular, el detalle del pedido apila por línea lo pedido, lo confirmado y lo recibido.

**Estados.** Proveedor sin WhatsApp: el envío ofrece PDF o copiar el texto. Pedido corto: "Faltan $ 23.600 para el pedido mínimo de $ 150.000". Recepción con diferencias: resumen antes de confirmar.

## Módulo Bot de WhatsApp (fase 2)

No se construye en v1: queda diseñado para la fase 2. El número de WhatsApp del local va a hacer dos trabajos: le manda pedidos a los proveedores y responde consultas del dueño y los empleados. No va a hablar con clientes.

**Reglas de WhatsApp que moldean el diseño** (API oficial de Meta):

- El primer mensaje a un proveedor que no escribió en las últimas 24 h tiene que ser una plantilla aprobada. Cuando responde, se abre una ventana de 24 h para mensajes libres ([Meta](https://developers.facebook.com/docs/whatsapp/pricing)).
- Las plantillas de utilidad se cobran por mensaje fuera de esa ventana; adentro son gratis (misma fuente). Los avisos del bot al dueño y al equipo también van como plantilla si pasaron más de 24 h desde su último mensaje.
- Botones de respuesta: hasta 3, de hasta 20 caracteres. Listas: hasta 10 opciones con títulos de hasta 24 caracteres ([límites](https://developer.exotel.com/docs/whatsapp-support/interactive-messages)).
- Desde el 15/1/2026 WhatsApp prohíbe asistentes de IA de propósito general; los bots de tareas concretas, como pedidos, siguen permitidos ([política](https://respond.io/blog/whatsapp-general-purpose-chatbots-ban)). El bot solo responde sobre el negocio.
- El local puede conectar el número que ya usa en WhatsApp Business (coexistencia), aunque una conexión dedicada es más estable ([coexistencia](https://kapso.com/blog/whatsapp-business-app-coexistence-cloud-api)).

**Función 1: pedidos a proveedores.** El bot arma el pedido, el dueño lo aprueba y el proveedor confirma con un botón. Si el proveedor escribe texto libre, el bot lo interpreta y le propone el cambio al dueño; nada cambia sin su confirmación. Conversación de ejemplo:

| Quién | Mensaje | Botones |
| --- | --- | --- |
| Bot al dueño | Pedido sugerido para Lácteos del Sur, entrega jueves 8/10: 14 productos, $ 186.400. | Enviar · Editar · Saltear |
| Dueño | Toca Enviar |  |
| Bot al proveedor (plantilla) | Hola Marcelo, te escribe el asistente de pedidos de Almacén La Esquina. Te mandamos el pedido 0042 para el jueves 8/10: 14 productos, total estimado $ 186.400. Detalle en el PDF. | Confirmar · Tengo cambios · Hablar con Carlos |
| Proveedor | No tengo ricota hasta el lunes, el resto ok |  |
| Bot al dueño | Marcelo dice que no tiene ricota hasta el lunes. ¿La saco del pedido 0042? | Sacarla · Dejarla · Responder yo |
| Dueño | Toca Sacarla |  |
| Bot al proveedor | Listo, sacamos la ricota. Pedido 0042 confirmado: 13 productos, $ 179.200, para el jueves 8/10. ¡Gracias! |  |

Si el proveedor no responde en el plazo configurado, recibe un recordatorio y el dueño un aviso. Si manda foto o PDF de la factura, queda adjunto al pedido para la recepción.

**Función 2: consultas internas.** Solo responde a números cargados en Usuarios, y cada uno ve lo que permite su rol.

| Le escriben | Responde | Quién puede |
| --- | --- | --- |
| "stock coca 2,25" | Coca-Cola 2,25 L: 14 u (mínimo 12). Última venta hace 20 min. Botón Sumar al pedido | Todos |
| "¿cuánto vendimos hoy?" | Hoy hasta las 18:40: $ 412.300 en 186 tickets, +8 % contra el sábado pasado | Dueño y encargado |
| "faltantes" | Productos debajo del mínimo agrupados por proveedor. Botón Armar pedidos | Dueño, encargado y repositor |
| "vencimientos" | Lo que vence en los próximos 7 días, con cantidades | Todos |
| "caja" | Quién está en el turno, desde qué hora y efectivo esperado | Dueño y encargado |
| "precio yerba playadito" | Precio de venta; costo y ganancia, solo a quien puede verlos | Todos |
| "se terminó la lavandina" | Anotado en faltantes: Lavandina 1 L (Limpieza Cuyo). Botón Deshacer | Todos |
| "pedido lácteos" | Estado del último pedido a ese proveedor | Dueño y encargado |

- Si no entiende, contesta con una lista: Stock de un producto, Ventas de hoy, Faltantes, Vencimientos, Caja, Pedidos y Ayuda.
- Mensajes que el bot manda solo al dueño: pedidos para aprobar, resumen de cada cierre de caja, resumen del día y alertas (diferencia de caja, venta anulada, pedido sin respuesta).
- Número desconocido: "Este número no está autorizado. Pedile acceso al dueño."

**Pantallas en la app.**

1. **Bandeja.** Conversaciones con proveedores y con el equipo; cada chat mezcla mensajes y eventos del sistema ("Pedido 0042 confirmado"). "Responder yo" pausa el bot en ese chat. En compu, tres columnas: chats, conversación y panel del pedido o proveedor. En celular, lista y chat.
2. **Plantillas.** Estado de aprobación (aprobada, en revisión, rechazada) y vista previa en un teléfono con las variables marcadas.
3. **Contactos autorizados.** Empleados con número y rol; proveedores con número.
4. **Automatizaciones.** "Armar el pedido de Lácteos del Sur los martes a las 9:00 y mandármelo para aprobar"; recordatorio por falta de respuesta; horario para escribirles a proveedores (por ejemplo, de 8 a 20 h); resúmenes automáticos.
5. **Conexión.** Número conectado, estado y mensajes pagos del mes.

**Para los mockups:** las dos conversaciones de ejemplo en un marco de celular, con estética genérica de mensajería (burbujas, botones debajo del mensaje, listas) y sin logos de terceros.

**Estados.** Número desconectado: aviso rojo en la bandeja y en Inicio. Plantilla rechazada: motivo y botón Editar. Número de proveedor inválido: el pedido queda en Borrador con el error a la vista.

## Módulo Clientes y fiado

El fiado se lleva como cuenta corriente: cada cliente tiene límite, plazo y un saldo que se ve en el momento de venderle.

**Pantallas.**

1. **Lista de clientes.** Nombre o apodo, teléfono, saldo, límite, días de la deuda más vieja y último movimiento. Filtros: con deuda, vencidos, sobre el límite. Arriba, el total de plata en la calle.
2. **Ficha.** Datos (nombre, apodo, teléfono, dirección, DNI opcional), límite, plazo (semanal, quincenal, 30 días o fin de mes), saldo y movimientos: compras fiadas con su ticket y pagos. Botón Compartir estado de cuenta, como imagen o PDF.
3. **Venta fiada,** desde Vender con F5. Buscar o crear el cliente con dos campos. El cobro muestra saldo, límite y saldo después de la compra. Opción de imprimir un comprobante para que el cliente firme.
4. **Cobrar fiado.** Monto, medio de pago (el efectivo entra a la caja del turno) y a qué deudas se aplica: las más viejas primero o tickets elegidos. Recibo para imprimir o compartir.

**Reglas que la UI muestra.**

- El cajero fía dentro del límite. Por encima del límite o con deuda vencida, pide PIN.
- Un cliente con deuda vencida aparece en rojo cuando se lo asigna a una venta.
- Un movimiento nunca se borra: se anula con un contramovimiento visible.
- Un saldo a favor (por una devolución) se ve en verde y se puede usar al pagar.

**Celular y compu.** En celular, lista con el saldo grande y acceso directo a Cobrar. En compu, tabla y ficha en panel lateral.

**Estado vacío.** "Cargá a tus clientes para fiarles y llevar su cuenta", con botón Nuevo cliente.

## Módulo Reportes

Cada reporte responde una pregunta del dueño: arriba la respuesta en un número grande, debajo el gráfico y el detalle.

| Reporte | Pregunta | Qué muestra |
| --- | --- | --- |
| Ventas | ¿Cuánto vendí y cuándo? | Total por día, semana o mes contra el período anterior; mapa de calor día × hora; por categoría, producto, cajero y medio de pago; ticket promedio |
| Rentabilidad | ¿Dónde gano y dónde pierdo? | Margen bruto en $ y % por producto, categoría y proveedor; productos debajo de la ganancia objetivo o que pierden plata |
| Stock | ¿Cuánta plata tengo en la góndola? | Stock valorizado a costo y a precio; días de cobertura; productos sin movimiento en 30, 60 o 90 días; quiebres de stock con venta perdida estimada; mermas por motivo en $ |
| Caja | ¿Cuadran los turnos? | Cierres por turno, diferencias acumuladas por cajero, gastos por categoría y retiros |
| Compras | ¿A quién le compro y cuánto aumenta? | Compras por proveedor; aumento de costos de cada proveedor en 30 y 90 días; pedido contra entregado y demoras |
| Fiado | ¿Cuánta plata tengo en la calle? | Deuda total por antigüedad (0 a 30, 31 a 60, más de 60 días) y clientes con mayor deuda |
| Resultado del mes | ¿Gané plata este mes? | Ventas menos costo de lo vendido menos gastos: los de caja y los fijos que se pagan por fuera (alquiler, servicios, sueldos), que se cargan acá como recurrentes |

**Común a todos.**

- Selector de período (hoy, ayer, 7 días, este mes, mes anterior, a medida) y comparación con el período anterior.
- Tocar una barra o una fila baja un nivel: de categoría a producto, de producto a sus ventas.
- Exportar a Excel o PDF y compartir.
- Si en Ajustes se cargan las comisiones de cada medio de pago, rentabilidad y resultado las descuentan.

**Celular y compu.** En celular, tarjetas con el número principal y un gráfico chico; tocar abre el reporte completo. En compu, filtros arriba, gráfico y tabla debajo.

**Permisos.** El cajero ve solo su turno; el encargado ve rentabilidad y resultado solo con permiso de ver costos.

**Estado sin datos.** "Necesitás al menos 7 días de ventas para ver tendencias", con lo que ya se puede ver.

## Módulo Ajustes

Lo que se configura una vez y cambia poco, en secciones con buscador. Entra solo el dueño.

| Sección | Qué se configura |
| --- | --- |
| Negocio | Nombre, logo, dirección, CUIT, condición fiscal (monotributo o responsable inscripto) y horario |
| Usuarios | Invitar por email o teléfono, rol, PIN, permisos finos y desactivar |
| Cajas | Puestos de cobro, fondo sugerido, tolerancia de diferencia, conteo ciego y denominaciones de billetes y monedas |
| Medios de pago | Activar cada medio, recargos y descuentos, alias y CVU, imagen del QR y comisión de cada medio |
| Precios y stock | Redondeo, ganancia por defecto (cada categoría puede tener la suya), ganancia mínima de alerta, tope de descuento sin PIN, vender sin stock con aviso o con PIN, mínimos y días de reserva por defecto |
| Dispositivos | Prueba de la pistola, impresora de tickets opcional (58 u 80 mm), cajón, balanza conectada (más adelante), planilla de códigos y etiquetas de góndola |
| Tickets | Encabezado, pie, logo, impresión automática y copias |
| WhatsApp | Fase 2. En v1, el WhatsApp de cada proveedor se carga en su ficha |
| Avisos | Matriz de tipo de aviso × canal (app y push; WhatsApp en fase 2) × rol |
| Facturación electrónica | Fase 2, ver abajo |
| Datos | Importar y exportar productos, clientes y proveedores; copia de seguridad |
| Actividad | Registro de auditoría con filtros por usuario, tipo y fecha |
| Funciones | Modo simple por defecto. Se prenden cuando hagan falta: promociones, lotes y vencimientos, conteos y varias cajas |

**Facturación electrónica en v1.** Una pantalla "Próximamente" explica lo que va a hacer: emitir factura A, B o C con CAE de ARCA desde el cobro. Lista lo que se va a necesitar (CUIT, certificado digital, punto de venta para web service) y ofrece "Avisame cuando esté". La condición fiscal del negocio y el IVA de cada producto ya se cargan en v1, así la fase 2 se enchufa sin migrar datos.

**Patrones.** En compu, secciones a la izquierda y formulario a la derecha; en celular, lista de secciones y una pantalla por sección. Los cambios sensibles (permisos, tolerancias, medios de pago) quedan registrados en Actividad.

## Flujos clave para prototipar

Estos recorridos cruzan varios módulos y conviene prototiparlos navegables en el dispositivo indicado. Los dos con ramas van dibujados; el resto, paso a paso.

&#91;embedded content: ciclo de reposición · del faltante al pago\]

En v1 el pedido sale por WhatsApp con un toque y el dueño marca la respuesta; si no hay confirmación en 24 h, aparece en Avisos. En fase 2, el bot hace estos pasos solo.

&#91;embedded content: turno de caja · de la apertura al cierre\]

Si la diferencia supera la tolerancia, el cierre pide comentario y avisa al dueño; el fondo que queda abre el turno siguiente.

**1. Venta rápida en el mostrador (Mac con pistola).**

1. Escanear Coca-Cola 2,25 L y Yerba Playadito 1 kg.
2. Tocar el botón Pan francés y tipear 750; tocar Jamón cocido y tipear 200.
3. F12, efectivo, billete de $ 20.000: total $ 18.550, vuelto $ 1.450.
4. Ticket impreso, cajón abierto y pantalla lista para el próximo cliente.

**2. Venta con el iPhone.**

1. Vender, cámara, escaneo continuo de tres productos.
2. Ajustar una cantidad con el stepper.
3. Cobrar con QR: se muestra el QR del local y el cajero confirma a mano.
4. Compartir el ticket.

**3. Producto que no está cargado.**

1. Se escanea un código desconocido: "Ese código no está cargado".
2. Alta rápida con nombre, precio y categoría; se suma a la venta.
3. Queda marcado "Completar ficha" para el dueño, porque no tiene costo ni proveedor.

**4. Precios nuevos desde la lista del proveedor (compu).**

1. Compras, Distribuidora Andina, Importar lista de precios.
2. Relacionar columnas. Vista previa: 86 costos cambian, en promedio +7 %.
3. Cambio masivo: recalcular cada precio con su ganancia y redondear a $ 50.
4. Confirmar e imprimir las etiquetas de los 86 productos.

**5. Conteo con el celular.**

1. El encargado crea el conteo "Góndola 3, Infusiones" y se lo asigna a Nico.
2. Nico escanea y tipea cantidades sin ver el stock del sistema; el contador marca "18 de 40".
3. El encargado revisa las diferencias en unidades y en $ y aprueba.

**6. Fiado y cobro.**

1. Venta de $ 6.700, F5, Rosa Giménez, cobro con Fiado: el saldo pasa de $ 18.400 a $ 25.100, con límite de $ 30.000.
2. Una semana después, Rosa paga $ 20.000 en efectivo. Entra a la caja del turno, cancela lo más viejo y deja un saldo de $ 5.100.

**7. Consulta por WhatsApp (fase 2).**

1. Nico escribe "faltantes" y recibe la lista por proveedor.
2. Escribe "se terminó la lavandina": queda anotada y aparece en el próximo pedido sugerido de Limpieza Cuyo.

**8. Primer uso.**

1. Crear la cuenta y cargar los datos del negocio.
2. Instalar la app en la Mac y en los iPhone y probar la pistola. Cargar productos con Modo carga, o directamente vendiendo.
3. Configurar medios de pago y alias.
4. Invitar al equipo y asignar PIN.
5. Cargar el WhatsApp de cada proveedor.
6. Abrir la primera caja.

**9. Fiambre por plata (Mac).**

1. Piden "$ 2.000 de queso cremoso".
2. Botón Queso cremoso, Por plata, 2000: la pantalla dice "Cortá 148 g".
3. Se corta, se pesa y se confirma el peso real; por ejemplo, 0,152 kg son $ 2.052.

## Sistema de diseño

Dirección visual: almacén de barrio, pero prolijo. Cálido y práctico, con mucho contraste y números que se leen desde lejos; nada de estética corporativa fría ni gradientes. Tema claro por defecto y tema oscuro. Modo simple por defecto: cada pantalla muestra su acción principal y lo esencial; lo demás va en un menú Más.

**Color.** Propuesta de tokens: Claude Design puede afinar los valores, pero no los roles. El verde primario y el de éxito son de la misma familia a propósito: en el mostrador, verde es plata que entra. En tema oscuro, el texto sobre el primario va oscuro.

| Token | Claro | Oscuro | Uso |
| --- | --- | --- | --- |
| fondo | #FAF8F5 | #14120F | Fondo de la app, tono papel |
| superficie | #FFFFFF | #1E1B17 | Tarjetas, paneles y tablas |
| borde | #E7E2DA | #34302A | Divisores y bordes |
| texto | #1F1B16 | #F3EFE9 | Texto principal |
| texto-suave | #6B635A | #A8A096 | Etiquetas y ayudas |
| primario | #1F6B4F | #4FB389 | Cobrar, guardar, acción principal |
| acento | #F2B33D | #F2B33D | Promos y destacados, siempre con texto oscuro |
| éxito | #177A48 | #4CC38A | Sobrante, confirmado, stock OK |
| alerta | #9A5B00 | #F0A43A | Stock bajo, por vencer, sin respuesta |
| peligro | #C2362F | #F07167 | Faltante, sin stock, anular, pierde plata |
| info | #2F6DB5 | #6EA8F0 | Sincronización y estados neutros |

**Tipografía.** Una sans con cifras tabulares (por ejemplo Inter o IBM Plex Sans), para que los montos se alineen en tablas y totales.

| Uso | Tamaño |
| --- | --- |
| Total en Vender | 48 a 64 px, semibold |
| Vuelto | 40 px |
| Número de tarjeta en Inicio | 28 a 32 px |
| Título de pantalla | 20 a 24 px |
| Texto | 16 px en celular, 14 a 15 px en compu |
| Etiquetas y ayudas | 12 a 13 px, nunca menos de 12 |

**Forma y espacio.** Grilla de 4 px; radio de 8 px (12 en tarjetas); bordes antes que sombras; íconos de trazo de 24 px; filas de tabla de 40 px en gestión y 44 px en Vender. En celular, nada tocable mide menos de 48 px; los botones de cobro y los billetes rápidos, 56 px o más.

**Componentes base.**

- Navegación: barra superior, barra lateral, barra inferior y riel de tablet.
- Buscador con escáner (lector y cámara) y búsqueda global.
- Venta: botón rápido de producto, línea de ticket con stepper, panel de total, selector de medio de pago, billetes rápidos, teclado numérico (efectivo, peso, cantidad, PIN) y vista de ticket de 58 y 80 mm.
- Datos: tabla con orden, selección múltiple y edición en línea; tarjeta de número; chip de estado (stock, pedido, pago, sincronización); filtros en chips; selector de fechas; gráficos de barras, líneas y mapa de calor.
- Contenedores: hoja inferior en celular, ventana modal, panel lateral en compu y asistente por pasos.
- Respuesta: aviso con Deshacer, banner, ítem de "Requiere atención", esqueletos, estado vacío, overlay de PIN y chip de conexión.
- Mensajería (fase 2): burbuja de chat, botones bajo el mensaje, lista y evento del sistema dentro del chat.

**Estados que toda pantalla trae diseñados:** cargando, vacío (con la primera acción), error con Reintentar, sin conexión, sin permiso (diciendo qué rol puede) y éxito.

**Breakpoints.**

| Ancho | Diseño |
| --- | --- |
| Hasta 599 px | Celular: una columna y barra inferior |
| 600 a 1023 px | Tablet vertical: riel de íconos; Vender como en celular, con más botones rápidos |
| 1024 a 1439 px | Compu o tablet apaisada: barra lateral y contenido; Vender en dos paneles |
| 1440 px o más | Pantalla grande: más columnas en gestión y grilla de botones rápidos más grande |

**Accesibilidad.** Contraste AA (4,5:1 en texto); un estado nunca depende solo del color, siempre lleva ícono y palabra; foco visible; todo Vender se usa sin mouse.

**Sonido y movimiento.** Pitido corto al escanear bien y otro tono al fallar, apagables. Transiciones de 150 a 200 ms: nada demora una venta.

**Tono de los textos.** Voseo y frases de mostrador: "Abrí la caja para vender", "Ese código no está cargado. ¿Lo cargás ahora?", "Faltan $ 1.200". El error dice qué hacer, no qué falló adentro del sistema.

## Datos de ejemplo

Un solo escenario para todas las pantallas, así los mockups cuentan la misma historia. Todos los valores son ficticios.

**Escenario.** Almacén La Esquina, Godoy Cruz, Mendoza. Sábado 3/10/2026, 18:40. Equipo: Carlos Díaz (dueño), Julián (encargado), Lucía (cajera, turno mañana), Tomás (cajero, turno tarde en curso) y Nico (repositor). La caja es la Mac del local con una pistola USB; Carlos usa iPhone.

**El día.**

- Ventas: $ 412.300 en 186 tickets (ticket promedio $ 2.217), +8 % contra el sábado pasado.
- Turno mañana (Lucía): $ 175.500, cerrado sin diferencia. Turno tarde (Tomás): $ 236.800, abierto desde las 14:00.
- Efectivo esperado: $ 121.900. Arqueo de ejemplo: contado $ 120.700, diferencia −$ 1.200.
- Fiado en la calle: $ 73.800, de los que $ 46.800 están vencidos en 3 clientes.

**Medios de pago del día.**

```csv
medio,monto,porcentaje
Efectivo,$ 156.700,38 %
Débito,$ 99.900,24 %
QR o billetera,$ 86.800,21 %
Transferencia,$ 37.100,9 %
Crédito,$ 19.700,5 %
Fiado,$ 12.100,3 %
```

**Productos.**

```csv
producto,codigo,costo,ganancia,precio,stock,minimo,estado,proveedor
"Coca-Cola 2,25 L",7790000001017,$ 3.300,39 %,$ 4.600,14,12,OK,Distribuidora Andina
Yerba Playadito 1 kg,7791234000012,$ 4.850,42 %,$ 6.900,3,8,Bajo,Distribuidora Andina
Leche entera 1 L sachet,7790000002014,$ 1.350,44 %,$ 1.950,0,24,Sin stock,Lácteos del Sur
Ricota 500 g,7790000002021,$ 1.800,44 %,$ 2.600,2,6,Bajo,Lácteos del Sur
Pan francés,PLU 1001,$ 2.700 por kg,41 %,$ 3.800 por kg,"6,400 kg","5,000 kg",OK,Panificadora San Martín
Jamón cocido,PLU 2001,$ 14.500 por kg,45 %,$ 21.000 por kg,"2,150 kg","2,000 kg",Vence 6/10,Fiambres Don Luis
Queso cremoso,PLU 2010,$ 9.600 por kg,41 %,$ 13.500 por kg,"1,800 kg","2,000 kg",Bajo,Fiambres Don Luis
"Aceite de girasol 1,5 L",7790000003011,$ 4.000,35 %,$ 5.400,9,6,OK,Distribuidora Andina
Fideos tirabuzón 500 g,7790000003028,$ 1.300,46 %,$ 1.900,22,10,OK,Distribuidora Andina
Huevos maple x 30,PLU 3001,$ 6.300,30 %,$ 8.200,4,3,OK,Mayorista Central
Lavandina 1 L,7790000004018,$ 850,53 %,$ 1.300,0,6,Sin stock,Limpieza Cuyo
Cerveza rubia lata 473 ml,7790000005015,$ 1.650,39 %,$ 2.300,48,24,OK (+18),Distribuidora Andina
Cigarrillos atado x 20,7790000005022,$ 4.150,13 %,$ 4.700,40,20,"OK (+18), precio fijo",Distribuidora Andina
```

**Proveedores.**

```csv
proveedor,rubro,dia_de_pedido,dia_de_entrega,canal,contacto,saldo_a_pagar
Distribuidora Andina,Bebidas y almacén,Viernes,Lunes,WhatsApp,Gustavo,$ 96.300
Lácteos del Sur,Lácteos,Martes,Jueves,WhatsApp,Marcelo,$ 184.500
Panificadora San Martín,Pan,Diario (pedido fijo),Diario,WhatsApp,Rubén,$ 41.000
Fiambres Don Luis,Fiambres y quesos,Viernes,Sábado,WhatsApp,Luis,$ 0
Limpieza Cuyo,Limpieza,Cada 15 días,2 días después,Manual,Silvia,$ 22.800
Mayorista Central,Almacén y varios,,,Compra en persona,,$ 0
```

**Clientes con fiado** (plazo de 30 días).

```csv
cliente,saldo,limite,vencido,dias_de_la_deuda_mas_vieja
Rosa Giménez,$ 18.400,$ 30.000,$ 0,12
El Tano (obra),$ 42.100,$ 40.000,$ 42.100,38
Sergio Paz,$ 3.100,$ 15.000,$ 3.100,35
Familia Ortiz,$ 7.800,$ 20.000,$ 1.600,31
Marta (vecina),$ 2.400,$ 10.000,$ 0,9
```

**Pedido 0042 a Lácteos del Sur,** entrega jueves 8/10: 14 productos, $ 186.400. Se manda el martes 6/10, día de pedido de ese proveedor.

```csv
producto,cantidad,costo_unitario,subtotal
Leche entera 1 L sachet,24 u (2 cajones),$ 1.350,$ 32.400
Yogur bebible 1 L,12 u,$ 2.100,$ 25.200
Ricota 500 g,4 u,$ 1.800,$ 7.200
Manteca 200 g,10 u,$ 2.300,$ 23.000
Queso crema 290 g,8 u,$ 2.900,$ 23.200
9 productos más,,,$ 75.400
```

**Ticket de ejemplo en 58 mm** (32 caracteres por línea).

```
        ALMACÉN LA ESQUINA
   San Martín 1234, Godoy Cruz
--------------------------------
Venta 004187    03/10/2026 18:41
Cajero: Tomás
--------------------------------
Coca-Cola 2,25 L
  1 x $ 4.600            $ 4.600
Pan francés
  0,750 kg x $ 3.800     $ 2.850
Jamón cocido
  0,200 kg x $ 21.000    $ 4.200
Yerba Playadito 1 kg
  1 x $ 6.900            $ 6.900
--------------------------------
TOTAL                   $ 18.550
Efectivo                $ 20.000
Vuelto                   $ 1.450
--------------------------------
Documento no válido como factura
    ¡Gracias por tu compra!
```

## Cómo usarlo en Claude Design

Se diseña por etapas, un prompt por etapa y siempre con este spec adjunto: primero el sistema de diseño, después los módulos, al final los prototipos.

**Antes de empezar.**

- Exportá este doc a Word (.docx) y adjuntalo en el primer mensaje: Claude Design acepta documentos DOCX ([Anthropic](https://www.anthropic.com/news/claude-design-anthropic-labs)).
- Claude Design aplica el sistema de diseño de tu organización en cada proyecto nuevo (misma fuente). Si ya tenés uno cargado de otro producto, aclará que Mostrador lleva el suyo.
- Pedí siempre iPhone (393 × 852) y Mac (1280 × 800) uno al lado del otro.
- Corregí con comentarios sobre el elemento en lugar de reescribir el prompt. Al aprobar, exportá el paquete para Claude Code o a PDF para revisar con el equipo.

**Etapa 0, contexto.**

```
Te adjunto la especificación de Mostrador, un sistema de gestión para un almacén de barrio en Argentina. Leela completa. Todavía no diseñes: devolveme la lista de pantallas que entendés que hay que diseñar, agrupadas por módulo, y tus dudas. Toda la interfaz va en español rioplatense con voseo. Se usa en una Mac con pistola lectora y en iPhone. Este producto tiene su propio sistema de diseño: no uses el de la organización.
```

**Etapa 1, sistema de diseño.**

```
Creá el sistema de diseño de Mostrador según la sección "Sistema de diseño" del spec: tokens de color en tema claro y oscuro, tipografía con cifras tabulares, espaciado, radios y los componentes base de la lista. Mostrá cada componente con sus estados (normal, hover, foco, deshabilitado, error) en celular y en compu. Incluí el teclado numérico, el overlay de PIN, los chips de estado de stock y el ítem de "Requiere atención".
```

**Etapa 2, Vender.**

```
Diseñá el módulo Vender con el sistema de diseño ya creado y los datos de ejemplo del spec. Pantallas: venta en modo simple para la Mac y para iPhone, teclado de peso con modo por plata, cobro con cuatro botones y pago combinado, venta lista con vuelto, ventas en espera, código desconocido con alta rápida, historial de ventas, devolución y el ticket de 58 mm. Sumá los estados: caja cerrada, sin conexión con ventas por sincronizar e impresora desconectada. En compu, mostrá la franja de atajos de teclado.
```

**Etapa 3, Caja.**

```
Diseñá el módulo Caja en celular y compu: abrir turno con conteo por billete, turno en curso con la cuenta del efectivo esperado ($ 121.900) y sus movimientos, retiro y gasto con PIN, arqueo ciego por denominación, resultado con una diferencia de −$ 1.200 que exige comentario, comprobante de cierre e historial de cierres.
```

**Etapa 4, Productos y stock.**

```
Diseñá Productos y stock: lista con filtros y selección múltiple (tabla en compu, tarjetas en celular), ficha con pestañas, alta rápida, modo carga con pistola y con cámara, planilla de códigos, importar desde Excel en pasos, cambio masivo de precios con vista previa, etiquetas de góndola, ajuste de stock, conteo en celular con escáner, revisión del conteo en compu, vencimientos, promociones, movimientos de stock y categorías. Usá los productos de ejemplo con sus estados: OK, Bajo, Sin stock, Vence y +18.
```

**Etapa 5, Compras.**

```
Diseñá Compras: proveedores, pedido sugerido de Lácteos del Sur con la explicación del cálculo, lista de pedidos por estado, detalle del pedido 0042 con línea de tiempo, recepción de mercadería en celular con el aviso de costo que subió, facturas y pagos, y el envío del pedido por WhatsApp: vista previa del mensaje y del PDF antes de abrir el chat. El bot de WhatsApp es fase 2: no lo diseñes todavía.
```

**Etapa 6, Inicio, Clientes y Reportes.**

```
Diseñá Inicio (panel del día del dueño en celular y compu, las variantes de cajero y repositor, la checklist de primeros pasos y el centro de avisos), Clientes y fiado (lista, ficha, cobrar fiado) y Reportes (las siete preguntas del spec, con gráficos). Usá los números del escenario: $ 412.300 en 186 tickets, los medios de pago del día y los avisos de "Requiere atención".
```

**Etapa 7, Ajustes y prototipos.**

```
Diseñá Ajustes con todas las secciones de la tabla, incluida la pantalla "Próximamente" de facturación electrónica. Después armá tres prototipos navegables: venta rápida con lector en compu, cierre de turno con diferencia y ciclo de reposición desde el faltante hasta la recepción en celular.
```

## Arquitectura técnica

Todo corre en tu VPS (Ubuntu, 8 GB de RAM, 128 GB) con Docker Compose, bajo un subdominio tuyo. La app es una PWA en TypeScript que vende sin conexión y sincroniza cuando vuelve internet.

&#91;embedded content: arquitectura · VPS con Docker Compose\]

Los dispositivos solo hablan con Caddy en tu subdominio; Open Food Facts y Web Push se usan desde el servidor, y WhatsApp y Claude API se suman en fase 2.

**Stack.**

| Capa | Elección | Por qué |
| --- | --- | --- |
| Lenguaje y repo | TypeScript en un monorepo con Bun workspaces: `apps/web`, `apps/api`, `packages/shared` | Tipos y reglas de negocio compartidos entre la app y la API |
| App | React, Vite, vite-plugin-pwa (Workbox) y Tailwind CSS | PWA instalable en iPhone y en la Mac; Tailwind toma los tokens del sistema de diseño |
| Datos en el dispositivo | Dexie sobre IndexedDB | Catálogo, clientes y ventas disponibles sin internet |
| Lector por cámara | @zxing/browser | Safari no trae lector nativo |
| API | Hono sobre Bun, validación con Zod | Liviana y rápida; si alguna librería falla en Bun, Hono corre igual en Node 22 |
| Base de datos | PostgreSQL 16 con Drizzle ORM | Transacciones para caja y stock; migraciones versionadas |
| Autenticación | Better Auth (email y contraseña, sesiones en Postgres) y PIN por usuario | Dueños con cuenta; mostrador con PIN en dispositivos habilitados |
| Tareas programadas | pg-boss, una cola sobre Postgres | Pedidos sugeridos, recordatorios, resúmenes y reintentos sin sumar Redis |
| Tiempo real | Server-Sent Events | Avisa a los dispositivos que hay cambios para bajar |
| Notificaciones | Web Push con claves VAPID | Avisos en el iPhone con la PWA instalada |
| WhatsApp | Fase 2: Cloud API de Meta, directa. En v1, enlace wa.me con el pedido escrito | Sin intermediario: solo se paga lo que cobra Meta |
| Texto libre del bot | Fase 2: Claude API, modelo Haiku, con salida estructurada | Interpreta "no tengo ricota hasta el lunes" y propone; nunca ejecuta solo |
| PDF de pedidos | pdf-lib | Liviano, sin navegador en el servidor |
| Servidor web | Caddy | HTTPS automático, que las PWA exigen, y proxy a la API |
| Pruebas | Vitest para la lógica, Playwright para los flujos | Playwright también prueba cortando la red |

**Servidor.**

- Docker Compose con cinco servicios: `caddy`, `api`, `worker` (misma imagen que la API), `postgres` y `backup`. Postgres no se expone fuera de la red de Docker.
- Un solo origen: `almacen.tudominio.com` (reemplazalo por tu subdominio) sirve la app en `/`, la API en `/api` y, en fase 2, el webhook de WhatsApp en `/api/whatsapp/webhook`. Sin CORS y con cookies simples.
- Consumo esperado: menos de 2 GB de RAM entre todo. Las fotos se achican en el dispositivo (lado mayor de 1024 px) antes de subirse.
- Firewall con los puertos 22, 80 y 443; SSH solo con llave; fail2ban y actualizaciones automáticas de seguridad.
- Deploy: el CI construye las imágenes y el VPS corre `docker compose pull && docker compose up -d`. La app avisa "Hay una versión nueva" y se actualiza al terminar la venta en curso, nunca en el medio.

**Backups y monitoreo.**

- Cada noche, `pg_dump` y las fotos se copian cifrados con restic a un bucket externo, por ejemplo Backblaze B2. Se guardan 7 copias diarias, 4 semanales y 12 mensuales. Una vez por mes se prueba restaurar.
- Uptime Kuma revisa el subdominio cada minuto y avisa si se cae o si falla un backup.
- Logs en JSON, con rotación.

**Seguridad y permisos.**

- La API valida cada permiso de la matriz; ocultar botones en la UI no alcanza.
- El PIN (4 a 6 dígitos) se guarda con argon2; 5 intentos fallidos bloquean 5 minutos.
- Cada dispositivo del mostrador lo habilita el dueño y se puede revocar.
- En fase 2, el webhook de WhatsApp verifica la firma `X-Hub-Signature-256` con el secreto de la app.
- Los secretos viven en el `.env` del servidor, nunca en el repo.

**PWA.**

- Build con target ES2020 (Chrome 80+ y Safari 14+). Si la Mac tiene un Chrome más viejo, se baja el target con @vitejs/plugin-legacy.
- En iPhone no aparece un botón de instalar: la app muestra una guía de dos pasos (Compartir → Agregar a inicio).
- La Mac pide almacenamiento persistente, para que el navegador no borre la copia local.

## Ventas sin conexión: cómo se guardan y sincronizan

El servidor es la fuente de verdad, pero cada dispositivo trabaja sobre su copia local y manda lo que hizo como una cola de operaciones. Así la Mac vende igual sin internet, y nada se pierde ni se duplica.

**Reglas de base.**

- Cada registro nuevo (venta, línea, pago, movimiento de caja, cliente) nace con un UUIDv7 generado en el dispositivo: no choca con los de otros dispositivos y se ordena por tiempo.
- Stock, caja y fiado son libros de movimientos que solo crecen. El stock de un producto es la suma de sus movimientos y Postgres guarda el total en la misma transacción: no hay un número de stock que se pise.
- Cada línea de venta guarda el precio y la descripción con que se vendió; un cambio de precio posterior no toca ventas pasadas.
- La numeración es por puesto de cobro (Caja 1 · Venta 004187), así dos dispositivos sin conexión nunca repiten número. En fase 2, el número de factura y el CAE se piden al servidor cuando hay conexión.
- Se guardan la hora del dispositivo y la del servidor; si difieren en más de 5 minutos, la venta queda marcada.

**Cómo viaja una venta.**

1. El cajero cobra. La venta se guarda en Dexie y se aplica en el momento al stock y a la caja locales.
2. Se agrega a la cola una operación con su `op_id`, tipo (`sale.create`), dispositivo, usuario y datos.
3. Con conexión, el dispositivo manda la cola en orden a `POST /api/sync/push`, en lotes de hasta 100.
4. La API aplica cada operación en una transacción. El `op_id` es único: si llega dos veces, devuelve el resultado anterior sin duplicar.
5. La API responde por operación: aplicada, o rechazada con motivo. Lo rechazado va a Avisos para que alguien lo resuelva; nunca se borra en silencio.
6. El dispositivo pide `GET /api/sync/pull?since=<cursor>`: los cambios de productos, precios, códigos, clientes, saldos y ajustes desde su último cursor, con las bajas marcadas. Guarda el cursor nuevo.

**Cuándo sincroniza:** al abrir la app, cada 20 segundos con conexión, al volver internet, después de cada venta y cuando el servidor avisa por SSE que hay cambios. La sincronización en segundo plano del navegador solo existe en Chrome, así que no se depende de ella: sincroniza con la app abierta, y la Mac del mostrador queda siempre abierta.

**Conflictos y cómo se resuelven.**

| Caso | Qué pasa |
| --- | --- |
| Dos dispositivos venden la última unidad sin conexión | Se aceptan las dos ventas; el stock queda negativo y aparece en Avisos |
| El dueño cambia un precio mientras la Mac está sin conexión | La Mac vende con el precio que tenía, la venta queda con ese precio y el nuevo baja al reconectar |
| El mismo producto se edita en dos dispositivos | Gana el último cambio, campo por campo, con la hora del servidor; queda en Actividad |
| Un fiado supera el límite estando sin conexión | La venta se acepta, porque ya ocurrió, y el dueño recibe un aviso |
| El mismo código se da de alta en dos dispositivos | El servidor detecta el código repetido y lo manda a Avisos para unir los productos |
| Se cierra un turno sin conexión | El cierre se calcula con los datos locales; el servidor lo recalcula al sincronizar y avisa si no coincide |

- **Funciona sin conexión:** vender, cobrar y fiar; abrir, mover y cerrar la caja; consultar precio y stock (última copia); alta rápida; recepción, que queda en cola.
- **Necesita internet:** mandar pedidos por WhatsApp, reportes de más de un día, Open Food Facts, importar Excel, usuarios y permisos.
- **iPhone:** guarda una copia más chica (catálogo y día en curso) y se usa con conexión. La que tiene que aguantar sin internet es la Mac.

## Cómo construirlo con Claude Code

Claude Code arma el proyecto tarea por tarea y deja cada avance en un commit local. Recibe un kit con este spec, el diseño, las reglas y un plan de 47 tareas, y puede trabajar de noche sin supervisión.

**El kit del repo.**

- `docs/spec.md`: este doc exportado a Markdown.
- `docs/design/`: el paquete que exporta Claude Design. Si todavía no está, las primeras tareas no lo necesitan.
- `CLAUDE.md`: stack, comandos, reglas duras y cómo trabajar sin supervisión.
- `docs/PLAN.md`: 47 tareas en 11 hitos, cada una con su criterio de "listo"; y `PROGRESS.md`, `DECISIONS.md` y `BLOCKERS.md` para dejar rastro.
- `.claude/settings.json`: bloquea push, ssh, sudo y reescribir la historia de git.
- `agent/`: contenedor con Bun, Claude Code y un Postgres de pruebas, limitado a 4 GB de RAM y 2 CPU.

**Hitos.**

1. Base del repo: monorepo, base de datos, API, app y PWA.
2. Datos, usuarios y permisos, con el escenario de ejemplo cargado.
3. Motor sin conexión: cola, push, pull, SSE y los seis conflictos.
4. Catálogo: productos, lectores, Modo carga, importar y planilla de códigos.
5. Vender y caja, con una venta sin conexión de punta a punta.
6. Stock: movimientos, precios masivos, conteos, vencimientos y promociones.
7. Compras: proveedores, pedido sugerido, envío por WhatsApp con enlace, recepción y facturas.
8. Clientes y fiado.
9. Inicio, avisos y reportes.
10. Ajustes y primeros pasos.
11. Infraestructura lista para desplegar, sin desplegar.

**Correrlo de noche.** Los pasos exactos están en `docs/NOCHE.md` del kit.

1. `agent/start.sh` levanta el contenedor en el VPS y abre Claude Code dentro de tmux con `--dangerously-skip-permissions`, el modo pensado para correr sin supervisión: siempre dentro de un contenedor y sin root ([docs](https://code.claude.com/docs/en/permission-modes)).
2. Se le da un `/goal` con la condición del kit. Claude sigue turno tras turno, y un modelo aparte revisa la condición al final de cada turno ([docs](https://code.claude.com/docs/en/goal)).
3. Si se alcanza el límite de uso del plan, la sesión abierta espera a que se renueve y continúa sola ([docs](https://code.claude.com/docs/en/interactive-mode)).
4. A la mañana se revisan `docs/PROGRESS.md`, `docs/BLOCKERS.md`, `docs/DECISIONS.md` y `git log`.

## Fase 2 y fuera de alcance

Cada cosa de fase 2 tiene su lugar reservado en v1, así entra sin rediseñar.

| Fase 2 | Qué queda listo en v1 |
| --- | --- |
| Factura electrónica ARCA: A, B y C con CAE, y notas de crédito | Selector de comprobante en el cobro, pantalla Próximamente, condición fiscal del negocio e IVA por producto |
| Pedidos de clientes por WhatsApp: catálogo, carrito, retiro o envío | Se monta sobre el bot de WhatsApp; los clientes ya existen en Clientes |
| Cobros integrados: QR dinámico, posnet y conciliación de transferencias | Medios de pago con comisión; la confirmación manual de hoy se automatiza |
| Leer la factura del proveedor con una foto (IA) | Botón de foto en la recepción: hoy adjunta, mañana completa las líneas |
| Varias sucursales y transferencias entre locales | Cajas y puestos de cobro como entidades propias; chip de caja en la barra superior |
| Balanza conectada a la Mac (USB o serie) | El teclado de peso ya existe: el peso se completaría solo |
| Catálogo compartido para autocompletar altas por código | Alta rápida con lugar para una sugerencia |
| Bot de WhatsApp: pedidos a proveedores y consultas internas | WhatsApp de cada proveedor, envío por enlace, estados del pedido y avisos. El diseño completo está en el módulo Bot |

Fuera de alcance: sueldos y fichaje de empleados, contabilidad completa, tienda online y programa de puntos.

**Para definir antes de construir.**

- [ ] Nombre y marca definitivos; Mostrador es provisorio.
- [x] Hardware: Mac en el mostrador con pistola USB, iPhone para los dueños, sin balanza etiquetadora.
- [ ] Qué macOS tiene la Mac: si es anterior a 13 Ventura, Chrome queda sin actualizaciones.
- [ ] Si arrancan con impresora de tickets y cajón, o sin imprimir.
- [ ] Qué proveedores aceptan pedidos por WhatsApp y cuáles van por preventista o mayorista.
- [ ] Fase 2: si el bot usa el número actual del local (coexistencia) o uno nuevo.
- [ ] Si los empleados usan su celular personal para la app (y para el bot en fase 2).

## Fuentes

- [Meta: precios de WhatsApp Business Platform y ventana de 24 h](https://developers.facebook.com/docs/whatsapp/pricing)
- [Exotel: límites de botones y listas en WhatsApp](https://developer.exotel.com/docs/whatsapp-support/interactive-messages)
- [respond.io: WhatsApp prohíbe los chatbots de propósito general](https://respond.io/blog/whatsapp-general-purpose-chatbots-ban)
- [Kapso: coexistencia entre WhatsApp Business App y Cloud API](https://kapso.com/blog/whatsapp-business-app-coexistence-cloud-api)
- [Anthropic: Claude Design](https://www.anthropic.com/news/claude-design-anthropic-labs)
- [Contadores en Red: Régimen de Transparencia Fiscal, Ley 27.743](https://contadoresenred.com/transparencia-fiscal-preguntas-frecuentes/)
- [9to5Google: Chrome deja de actualizarse en macOS 12](https://9to5google.com/2026/01/23/google-chrome-ending-support-for-macos-monterey-in-july-2026/)
- [caniuse: BarcodeDetector en Safari](https://caniuse.com/mdn-api_barcodedetector)
- [Open Food Facts: API de productos por código](https://openfoodfacts.github.io/openfoodfacts-server/api/)
- [Claude Code: /goal](https://code.claude.com/docs/en/goal)
- [Claude Code: modos de permisos](https://code.claude.com/docs/en/permission-modes)
- [Claude Code: esperar el límite de uso](https://code.claude.com/docs/en/interactive-mode)
- [Claude Code: entornos aislados](https://code.claude.com/docs/en/sandbox-environments)
