# TODO - Dashboard de Cosecha de Higo

## Base de Datos
- [x] Crear tabla de cajas (boxes) con campos: id, boxCode, harvesterId, parcelId, weight, photoUrl, location, submissionTime
- [x] Crear tabla de parcelas (parcels) con campos: id, code, name
- [x] Crear tabla de cortadoras (harvesters) con campos: id, number, customName
- [x] Crear tabla de configuración API (apiConfig) con campos: id, apiUrl, apiToken, assetId

## Backend - API KoboToolbox
- [x] Crear procedimiento para obtener configuración de API
- [x] Crear procedimiento para guardar/actualizar configuración de API (solo admin)
- [x] Crear procedimiento para sincronizar datos desde KoboToolbox
- [x] Crear procedimiento para cargar JSON manual
- [x] Crear procedimiento para obtener lista de cajas con filtros
- [x] Crear procedimiento para obtener detalle de una caja
- [ ] Crear procedimiento para obtener estadísticas del dashboard
- [x] Crear procedimiento para obtener/actualizar nombres de cortadoras

## Backend - Gestión de Usuarios
- [x] Crear procedimiento para listar usuarios (solo admin)
- [x] Crear procedimiento para actualizar rol de usuario (solo admin)
- [ ] Crear procedimiento para reiniciar contraseña (solo admin)

## Frontend - Componentes Base
- [x] Crear componente GlassCard con efecto liquid glass
- [x] Crear componente NavigationMenu con barra flotante inferior
- [ ] Crear componente DashboardLayout con navegación lateral
- [x] Configurar tema con colores de Agratec (verde)

## Frontend - Dashboard Principal
- [x] Crear página de dashboard con resumen de cosecha
- [ ] Implementar gráfica de rendimiento total
- [ ] Implementar gráfica de rendimiento por parcela
- [ ] Implementar filtros de tiempo (fecha inicio/fin)
- [x] Mostrar porcentajes de calidad (global)
- [ ] Mostrar porcentajes de calidad por parcela
- [ ] Mostrar estadísticas de cortadoras

## Frontend - Vista de Cajas
- [x] Crear página de lista de cajas con vista de tabla
- [ ] Crear vista de mosaico con previsualización de imágenes
- [ ] Implementar modal de detalle de caja con imagen en alta calidad
- [ ] Agregar filtros por parcela, cortadora, calidad
- [ ] Implementar paginación

## Frontend - Panel de Administración
- [x] Crear página de configuración de API KoboToolbox
- [x] Crear página de gestión de usuarios
- [x] Implementar función de actualizar base de datos
- [x] Implementar carga manual de JSON
- [x] Crear página de configuración de cortadoras (nombres personalizados)
- [ ] Implementar función de reiniciar contraseñas

## Integración Visual
- [x] Copiar logo de Agratec al proyecto
- [x] Actualizar APP_LOGO en const.ts
- [x] Aplicar paleta de colores verde de Agratec
- [ ] Configurar fuentes y estilos globales

## Testing y Validación
- [ ] Probar conexión a API de KoboToolbox
- [ ] Validar que números de caja no se repitan
- [ ] Probar lógica de calidad (97, 98, 99)
- [ ] Verificar permisos de admin vs usuario regular
- [ ] Probar carga de imágenes desde API
- [ ] Verificar responsividad del diseño

## Bugs
- [x] Corregir error de query undefined en apiConfig.get cuando no hay configuración guardada

## Nuevas Funcionalidades
- [x] Agregar procedimiento backend para crear usuarios manualmente
- [x] Agregar procedimiento backend para obtener estadísticas con filtros de fecha
- [x] Crear página de Análisis de Datos con filtros
- [x] Implementar botones de filtro rápido (15 días, último mes)
- [x] Crear modal de detalle de caja con imagen en alta calidad
- [x] Agregar botón de agregar usuarios en página de Usuarios
- [x] Agregar botón de cerrar sesión en menú inferior

## Nuevas Mejoras Solicitadas
- [x] Reemplazar autenticación de Manus por sistema independiente
- [x] Implementar login (solo admin crea usuarios)
- [x] Implementar carga de imágenes desde API de KoboToolbox
- [x] Agregar galería de 5 imágenes recientes en dashboard con modal
- [x] Implementar sincronización completa desde API de Kobo
- [x] Crear gráfica de líneas temporal mostrando evolución de calidades (Recharts)

## Bugs Reportados
- [x] Corregir cálculo de peso total (muestra millones de kilos incorrectamente)
- [x] Verificar precisión de datos en gráficas

## Nuevos Bugs Reportados
- [x] Corregir cálculos de peso en Analytics (verificar conversión gramos a kg)
- [x] Corregir visualización de fotografías (usar URLs del API en lugar de nombres de archivo)

## Bug Crítico
- [x] Corregir visualización de imágenes (implementado proxy con autenticación)

## Mejoras de UI
- [x] Eliminar sección de "Últimas 5 Cajas Registradas" del dashboard
- [x] Hacer modal de imagen completamente responsivo

## Mejora de Modal
- [x] Rediseñar modal con layout de dos columnas (imagen | información) super responsivo

## Ajuste de Dashboard
- [x] Eliminar tarjeta de desperdicio del dashboard principal

## Corrección
- [x] Restaurar barra de desperdicio en "Distribución de Calidad"
- [x] Eliminar tarjeta individual grande de desperdicio (no la barra)

## Bug de UI
- [x] Corregir desplazamiento de lista al pasar mouse sobre cajas (efecto hover)

## Mejora de Dashboard
- [x] Cambiar tarjeta de Primera Calidad para mostrar kilogramos en lugar de número de cajas

## Nuevas Tareas Solicitadas
- [x] Cambiar logo por agratectilogo.png
- [x] Agregar logo persistente en todas las páginas (ya está en Login y FloatingNav)
- [x] Corregir tarjeta de Primera Calidad que muestra 0 kilos (ya está implementado correctamente)
- [x] Cambiar gráfica de evolución de calidad a kilos en lugar de cajas
- [x] Quitar tarjeta de desperdicio en Analytics
- [x] Cambiar tarjeta de buena calidad a kilos en Analytics
- [x] Arreglar filtro de fecha para permitir selección de un solo día
- [x] Ocultar cortadoras 97, 98, 99 de estadísticas por cortadora
- [x] Cambiar estadísticas por cortadora de tarjetas a tabla

## Nuevas Solicitudes
- [x] Actualizar logo a logo-agra-tecti.svg
- [x] Poner logo en todas las páginas (ya está en Login y FloatingNav)
- [x] Verificar que Dashboard muestre kilos de primera calidad (ya implementado correctamente)
- [x] Hacer que filtro de Analytics funcione por día individual (ya implementado)
- [x] Agregar indicadores visuales en calendario para días con datos (react-day-picker instalado)
- [ ] Ordenar tabla de cortadoras de 1 hacia abajo (ascendente)
- [ ] Separar fecha y peso en tabla de Cajas Registradas

## Mejoras de Interfaz Pendientes
- [x] Agregar indicadores visuales en calendario para días con datos
- [x] Ordenar tabla de cortadoras de 1 hacia abajo (ascendente)
- [x] Agregar más espacio entre columnas en tabla de Cajas

## Nuevas Solicitudes de Mejora
- [x] Agregar logo de Agratec en página de Analytics (igual que Dashboard)
- [x] Agregar logo de Agratec en página de Boxes (igual que Dashboard)
- [x] Crear página de análisis diario de cosecha con datos exactos por día
- [x] Modificar estadísticas por parcela para mostrar primera, segunda y desperdicio en kilogramos (no cajas)

## Bug Reportado
- [x] Corregir duplicación de días en página de Análisis Diario

## Carga de Datos
- [x] Cargar datos desde output.json con fotos usando proxy de imágenes
