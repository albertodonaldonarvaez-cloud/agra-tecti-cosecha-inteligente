package com.agratec.fieldapp.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.agratec.fieldapp.ui.theme.*

/**
 * Pregunta al usuario qué hacer con las fotos cuando está usando DATOS MÓVILES.
 * Los datos (actividades, notas) siempre se sincronizan; aquí solo se decide
 * sobre las fotos, que son lo que consume el plan.
 */
@Composable
fun PhotoPolicyDialog(
    pendingPhotos: Int,
    onDecide: (allowUpload: Boolean, allowDownload: Boolean) -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text("📶 Estás usando datos móviles", color = TextPrimary, fontWeight = FontWeight.Bold)
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    if (pendingPhotos > 0)
                        "Tus actividades y notas ya se están sincronizando. Tienes $pendingPhotos foto${if (pendingPhotos == 1) "" else "s"} pendiente${if (pendingPhotos == 1) "" else "s"} de subir."
                    else
                        "Tus actividades y notas se sincronizan siempre, aunque no haya WiFi.",
                    color = TextSecondary,
                )
                Text(
                    "Las fotos pesan mucho más. ¿Qué prefieres hacer con ellas cuando no hay WiFi?",
                    color = TextSecondary,
                )
                Text(
                    "Puedes cambiarlo cuando quieras desde la pantalla de la Libreta.",
                    color = TextTertiary,
                    fontSize = 12.sp,
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { onDecide(false, false) }) {
                Text("Solo con WiFi", color = AgraGreen, fontWeight = FontWeight.SemiBold)
            }
        },
        dismissButton = {
            TextButton(onClick = { onDecide(true, true) }) {
                Text("Usar datos también", color = TextSecondary)
            }
        },
        containerColor = Color.White,
        shape = RoundedCornerShape(20.dp),
    )
}

/**
 * Ajustes rápidos de fotos con datos móviles (subir / descargar).
 */
@Composable
fun PhotoSettingsDialog(
    uploadOnMobile: Boolean,
    downloadOnMobile: Boolean,
    onChange: (upload: Boolean, download: Boolean) -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Fotos con datos móviles", color = TextPrimary, fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    "Las actividades y notas siempre se sincronizan. Estas opciones son solo para las fotos.",
                    color = TextTertiary,
                    fontSize = 12.sp,
                )
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Subir mis fotos", color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                        Text("Con datos móviles", color = TextTertiary, fontSize = 11.sp)
                    }
                    Switch(
                        checked = uploadOnMobile,
                        onCheckedChange = { onChange(it, downloadOnMobile) },
                        colors = SwitchDefaults.colors(checkedTrackColor = AgraGreen),
                    )
                }
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Descargar fotos", color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                        Text("Con datos móviles", color = TextTertiary, fontSize = 11.sp)
                    }
                    Switch(
                        checked = downloadOnMobile,
                        onCheckedChange = { onChange(uploadOnMobile, it) },
                        colors = SwitchDefaults.colors(checkedTrackColor = AgraGreen),
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Listo", color = AgraGreen, fontWeight = FontWeight.SemiBold) }
        },
        containerColor = Color.White,
        shape = RoundedCornerShape(20.dp),
    )
}
