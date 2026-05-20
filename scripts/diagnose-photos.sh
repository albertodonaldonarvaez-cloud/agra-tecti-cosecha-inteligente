#!/bin/sh
# Script de diagnóstico para fotos de notas de campo
# Ejecutar dentro del contenedor: docker compose exec app sh /app/scripts/diagnose-photos.sh

echo "============================================"
echo "  DIAGNÓSTICO DE FOTOS - NOTAS DE CAMPO"
echo "============================================"

echo ""
echo "=== 1. Directorio de fotos ==="
echo "Espacio en disco:"
du -sh /app/photos/ 2>/dev/null || echo "  /app/photos/ no existe"
du -sh /app/photos/field-notes/ 2>/dev/null || echo "  /app/photos/field-notes/ no existe"

echo ""
echo "=== 2. Total de fotos en disco ==="
TOTAL_FILES=$(find /app/photos/field-notes/ -type f -name "*.jpg" 2>/dev/null | wc -l)
echo "  Archivos .jpg encontrados: $TOTAL_FILES"

echo ""
echo "=== 3. Fotos más pesadas (top 10) ==="
find /app/photos/field-notes/ -type f -name "*.jpg" -exec ls -lhS {} + 2>/dev/null | head -10

echo ""
echo "=== 4. Distribución de tamaños ==="
echo "  > 5MB:"
find /app/photos/field-notes/ -type f -name "*.jpg" -size +5M 2>/dev/null | wc -l
echo "  1-5MB:"
find /app/photos/field-notes/ -type f -name "*.jpg" -size +1M -size -5M 2>/dev/null | wc -l
echo "  < 1MB:"
find /app/photos/field-notes/ -type f -name "*.jpg" -size -1M 2>/dev/null | wc -l

echo ""
echo "=== 5. Folios con fotos en disco ==="
ls /app/photos/field-notes/ 2>/dev/null | head -20
echo "  (mostrando primeros 20)"

echo ""
echo "============================================"
echo "  DIAGNÓSTICO COMPLETADO"
echo "============================================"
