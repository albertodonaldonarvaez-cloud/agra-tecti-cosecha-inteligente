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
