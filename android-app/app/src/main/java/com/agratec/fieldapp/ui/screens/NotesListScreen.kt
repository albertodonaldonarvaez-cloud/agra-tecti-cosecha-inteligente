package com.agratec.fieldapp.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.agratec.fieldapp.data.local.entity.FieldNoteEntity
import com.agratec.fieldapp.data.repository.FieldNoteRepository
import com.agratec.fieldapp.data.repository.PhotoDiagnostics
import com.agratec.fieldapp.sync.SyncStatus
import com.agratec.fieldapp.sync.SyncWorker
import com.agratec.fieldapp.ui.components.*
import com.agratec.fieldapp.ui.theme.*
import kotlinx.coroutines.launch

/** Estados de seguimiento de una nota, en el orden en que avanzan */
private val NOTE_STATUSES = listOf(
    "abierta" to "Abierta",
    "en_revision" to "En revisión",
    "en_progreso" to "En proceso",
    "resuelta" to "Resuelta",
    "descartada" to "Descartada",
)

fun noteStatusLabel(status: String): String =
    NOTE_STATUSES.find { it.first == status }?.second ?: status

fun noteStatusColor(status: String): Color = when (status) {
    "resuelta" -> StatusResolved
    "descartada" -> TextTertiary
    "en_progreso" -> SyncPending
    "en_revision" -> StatusInProgress
    else -> StatusOpen
}

/** Una nota cerrada ya no necesita seguimiento */
private fun isNoteClosed(status: String) = status == "resuelta" || status == "descartada"

/**
 * Notas de campo: observaciones rápidas del recorrido (plagas, riego, daños…),
 * con seguimiento para cerrarlas desde el propio campo.
 */
@Composable
fun NotesListScreen(
    onSync: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repository = remember { FieldNoteRepository(context) }
    val allNotes by repository.getAllNotes().collectAsState(initial = emptyList())
    var unsyncedCount by remember { mutableIntStateOf(0) }
    var unsyncedPhotoCount by remember { mutableIntStateOf(0) }
    var failedPhotoCount by remember { mutableIntStateOf(0) }
    var showDiagDialog by remember { mutableStateOf(false) }
    var diagnostics by remember { mutableStateOf<PhotoDiagnostics?>(null) }
    var diagLoading by remember { mutableStateOf(false) }

    var filter by rememberSaveable { mutableStateOf("abiertas") } // abiertas | cerradas | todas
    var followUpNote by remember { mutableStateOf<FieldNoteEntity?>(null) }

    val syncStatus by SyncStatus.state.collectAsState()

    LaunchedEffect(allNotes) {
        unsyncedCount = repository.getUnsyncedNoteCount()
        unsyncedPhotoCount = repository.getUnsyncedPhotoCount()
        failedPhotoCount = repository.getFailedPhotoCount()
    }

    // Al entrar: traer del servidor las notas nuevas, los cambios y los borrados
    LaunchedEffect(Unit) { repository.pullFromServer() }

    val openCount = allNotes.count { !isNoteClosed(it.status) }
    val closedCount = allNotes.size - openCount
    val notes = when (filter) {
        "abiertas" -> allNotes.filter { !isNoteClosed(it.status) }
        "cerradas" -> allNotes.filter { isNoteClosed(it.status) }
        else -> allNotes
    }

    val criticalCount = allNotes.count { it.severity == "critica" && !isNoteClosed(it.status) }
    val highCount = allNotes.count { it.severity == "alta" && !isNoteClosed(it.status) }

    // ── Seguimiento: cambiar el estado de una nota ──
    followUpNote?.let { note ->
        NoteFollowUpDialog(
            note = note,
            onDismiss = { followUpNote = null },
            onSave = { status, resolution ->
                scope.launch {
                    repository.setNoteStatus(note.folio, status, resolution)
                    followUpNote = null
                }
            },
        )
    }

    // ===== DIAGNÓSTICO DE FOTOS =====
    if (showDiagDialog) {
        LaunchedEffect(showDiagDialog) {
            diagLoading = true
            diagnostics = repository.runPhotoDiagnostics()
            diagLoading = false
        }

        AlertDialog(
            onDismissRequest = { showDiagDialog = false },
            title = { Text("🔍 Diagnóstico de fotos", color = TextPrimary, fontWeight = FontWeight.Bold, fontSize = 16.sp) },
            text = {
                if (diagLoading) {
                    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator(color = AgraGreen)
                        Spacer(Modifier.height(8.dp))
                        Text("Analizando...", color = TextSecondary, fontSize = 13.sp)
                    }
                } else {
                    val d = diagnostics
                    if (d != null) {
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            DiagRow("📷 Total sin sync", "${d.totalUnsynced}")
                            DiagRow("✅ Listas para subir", "${d.readyToUpload}", if (d.readyToUpload > 0) AgraGreen else TextTertiary)
                            DiagRow("⏳ Bloqueadas (nota no sync)", "${d.blockedByNote}", if (d.blockedByNote > 0) SyncPending else TextTertiary)
                            DiagRow("👻 Huérfanas (sin nota)", "${d.orphaned}", if (d.orphaned > 0) SyncError else TextTertiary)
                            DiagRow("❌ Con error", "${d.failed}", if (d.failed > 0) SyncError else TextTertiary)

                            Spacer(Modifier.height(8.dp))
                            Text(
                                "Archivos locales (muestra de ${d.fileChecks.size}):",
                                fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = TextPrimary,
                            )
                            d.fileChecks.forEach { fc ->
                                val icon = if (fc.exists) "✅" else "❌"
                                val sizeText = if (fc.exists) "${fc.sizeKB}KB" else "NO EXISTE"
                                val errorText = if (fc.lastError != null) "\n   Error: ${fc.lastError}" else ""
                                Text(
                                    "$icon ${fc.photoId}… → $sizeText (intentos: ${fc.syncAttempts})$errorText",
                                    fontSize = 11.sp,
                                    color = if (fc.exists) TextSecondary else SyncError,
                                    lineHeight = 14.sp,
                                )
                            }

                            if (d.readyToUpload == 0 && d.totalUnsynced > 0) {
                                Spacer(Modifier.height(8.dp))
                                Text(
                                    "⚠️ Las fotos NO se suben porque las notas no están marcadas como sincronizadas en la base local, o son huérfanas.",
                                    fontSize = 12.sp, color = SyncError, fontWeight = FontWeight.Medium,
                                )
                            }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    scope.launch {
                        // Limpiar fantasmas (archivos que ya no existen) y reintentar el resto
                        repository.cleanupGhostPhotos()
                        repository.resetFailedPhotos()
                        SyncWorker.enqueueImmediateSync(context)
                        showDiagDialog = false
                        unsyncedPhotoCount = repository.getUnsyncedPhotoCount()
                        failedPhotoCount = repository.getFailedPhotoCount()
                    }
                }) {
                    Text("🧹 Limpiar + Sync", color = AgraGreen, fontWeight = FontWeight.SemiBold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDiagDialog = false }) { Text("Cerrar", color = TextTertiary) }
            },
            containerColor = Color.White,
            shape = RoundedCornerShape(20.dp),
        )
    }

    Column(Modifier.fillMaxSize()) {
        AgraHeader(
            title = "Notas de Campo",
            subtitle = "$openCount abierta${if (openCount == 1) "" else "s"} · $closedCount cerrada${if (closedCount == 1) "" else "s"}",
            badge = if (unsyncedCount > 0) "$unsyncedCount sin subir" else null,
            actions = {
                AgraSyncAction(unsyncedCount = unsyncedCount, onClick = onSync)
                AgraHeaderAction(Icons.Default.Settings, "Ajustes", onOpenSettings)
            },
        )

        syncStatus?.let { status ->
            AgraSyncBanner(
                message = status.message,
                at = status.at,
                ok = status.ok,
                photosWaiting = status.photosWaitingForWifi,
                onPhotosClick = onOpenSettings,
            )
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            AgraChip("📌 Abiertas ($openCount)", filter == "abiertas", onClick = { filter = "abiertas" })
            AgraChip("✅ Cerradas", filter == "cerradas", onClick = { filter = "cerradas" })
            AgraChip("Todas", filter == "todas", onClick = { filter = "todas" })
        }

        LazyColumn(
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 160.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxSize(),
        ) {
            // Banner de fotos — abre el diagnóstico
            if (unsyncedPhotoCount > 0 || failedPhotoCount > 0) {
                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(16.dp))
                            .background(if (failedPhotoCount > 0) Color(0xFFFEF2F2) else Color(0xFFFFFBEB))
                            .clickable { showDiagDialog = true }
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            if (failedPhotoCount > 0) Icons.Default.ErrorOutline else Icons.Default.PhotoCamera,
                            contentDescription = null,
                            tint = if (failedPhotoCount > 0) SyncError else SyncPending,
                            modifier = Modifier.size(24.dp),
                        )
                        Spacer(Modifier.width(10.dp))
                        Column(Modifier.weight(1f)) {
                            Text(
                                if (failedPhotoCount > 0) "$failedPhotoCount fotos fallidas" else "$unsyncedPhotoCount fotos pendientes",
                                fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = TextPrimary,
                            )
                            Text("Toca para ver el diagnóstico", fontSize = 11.sp, color = TextSecondary)
                        }
                        Icon(Icons.Default.ChevronRight, contentDescription = null, tint = TextTertiary, modifier = Modifier.size(20.dp))
                    }
                }
            }

            item {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    StatCard(
                        label = "Abiertas", value = openCount, icon = Icons.Default.Description,
                        iconColor = AgraGreen, iconBgColor = AgraGreen.copy(alpha = 0.12f),
                        modifier = Modifier.weight(1f),
                    )
                    StatCard(
                        label = "Sin subir", value = unsyncedCount, icon = Icons.Default.CloudUpload,
                        iconColor = SyncPending, iconBgColor = SyncPending.copy(alpha = 0.12f),
                        modifier = Modifier.weight(1f),
                    )
                    StatCard(
                        label = "Urgentes", value = criticalCount + highCount, icon = Icons.Default.Warning,
                        iconColor = SeverityCritical, iconBgColor = SeverityCritical.copy(alpha = 0.12f),
                        modifier = Modifier.weight(1f),
                    )
                }
            }

            if (notes.isEmpty()) {
                item {
                    AgraEmptyState(
                        emoji = "📝",
                        title = when (filter) {
                            "abiertas" -> "No hay notas abiertas"
                            "cerradas" -> "Todavía no hay notas cerradas"
                            else -> "No hay notas de campo"
                        },
                        message = if (filter == "abiertas" && allNotes.isNotEmpty())
                            "Todo lo reportado ya quedó atendido."
                        else "Crea una nota para reportar lo que observaste en el recorrido.",
                        modifier = Modifier.fillParentMaxHeight(0.55f),
                    )
                }
            }

            items(notes, key = { it.id }) { note ->
                NoteCard(note, onClick = { followUpNote = note })
            }
        }
    }
}

@Composable
private fun NoteCard(note: FieldNoteEntity, onClick: () -> Unit) {
    val catColor = getCatColor(note.category)
    val closed = isNoteClosed(note.status)
    val isHighPriority = !closed && (note.severity == "critica" || note.severity == "alta")

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(elevation = 3.dp, shape = RoundedCornerShape(20.dp), ambientColor = Color.Black.copy(alpha = 0.06f))
            .clip(RoundedCornerShape(20.dp))
            .background(Color.White.copy(alpha = if (closed) 0.55f else 0.8f))
            .border(0.5.dp, CardBorder.copy(alpha = 0.4f), RoundedCornerShape(20.dp))
            .clickable(onClick = onClick)
            // Franja de prioridad a la izquierda
            .then(
                if (isHighPriority) Modifier.drawBehind {
                    val barColor = if (note.severity == "critica") Color(0xFFEF4444) else Color(0xFFF97316)
                    drawRoundRect(
                        color = barColor,
                        topLeft = Offset.Zero,
                        size = Size(4.dp.toPx(), size.height),
                        cornerRadius = CornerRadius(4.dp.toPx()),
                    )
                } else Modifier
            ),
    ) {
        Row(
            Modifier.fillMaxWidth().padding(14.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Box(
                Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(catColor.copy(alpha = 0.1f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(getCatIcon(note.category), null, tint = catColor, modifier = Modifier.size(22.dp))
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                    Text(getCatLabel(note.category), fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = TextPrimary)
                    Spacer(Modifier.width(8.dp))
                    StatusBadge(
                        text = note.severity.replaceFirstChar { c -> c.uppercase() },
                        color = when (note.severity) {
                            "critica" -> SeverityCritical
                            "alta" -> SeverityHigh
                            "media" -> SeverityMedium
                            else -> SeverityLow
                        },
                        showDot = true,
                    )
                    Spacer(Modifier.width(6.dp))
                    StatusBadge(
                        text = noteStatusLabel(note.status),
                        color = noteStatusColor(note.status),
                    )
                }

                Spacer(Modifier.height(6.dp))

                Text(
                    note.description,
                    fontSize = 13.sp, color = TextSecondary, maxLines = 2,
                    overflow = TextOverflow.Ellipsis, lineHeight = 18.sp,
                )

                if (!note.resolutionNotes.isNullOrBlank()) {
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "✔ ${note.resolutionNotes}",
                        fontSize = 12.sp, color = AgraEmerald600, maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }

                Spacer(Modifier.height(10.dp))

                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(Color(0xFFF3F4F6))
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Default.Tag, null, tint = TextTertiary, modifier = Modifier.size(10.dp))
                        Spacer(Modifier.width(3.dp))
                        Text(note.folio.take(8), fontSize = 10.sp, fontWeight = FontWeight.Medium, color = TextTertiary)
                    }

                    val pending = !note.isSynced || note.statusDirty
                    StatusBadge(
                        text = if (pending) "Pendiente" else "Sincronizado",
                        color = if (pending) SyncPending else SyncOk,
                        showDot = true,
                        backgroundColor = if (pending) SyncPending.copy(alpha = 0.06f) else SyncOk.copy(alpha = 0.06f),
                    )
                }
            }
        }
    }
}

private fun getCatIcon(c: String): ImageVector = when (c) {
    "plaga_enfermedad" -> Icons.Default.BugReport; "riego_drenaje" -> Icons.Default.Water
    "dano_mecanico" -> Icons.Default.Warning; "maleza" -> Icons.Default.Grass
    "fertilizacion" -> Icons.Default.Science; "suelo" -> Icons.Default.Terrain
    "infraestructura" -> Icons.Default.Construction; "fauna" -> Icons.Default.Pets
    "arboles_mal_plantados" -> Icons.Default.Forest; else -> Icons.Default.Notes
}
private fun getCatColor(c: String): Color = when (c) {
    "plaga_enfermedad" -> CatPlaga; "riego_drenaje" -> CatRiego
    "dano_mecanico" -> CatDano; "maleza" -> CatMaleza
    "fertilizacion" -> CatFertilizacion; "suelo" -> CatSuelo
    "infraestructura" -> CatInfra; "fauna" -> CatFauna
    "arboles_mal_plantados" -> CatArboles; else -> CatOtro
}
private fun getCatLabel(c: String): String = when (c) {
    "arboles_mal_plantados" -> "Árboles"; "plaga_enfermedad" -> "Plaga/Enfermedad"
    "riego_drenaje" -> "Riego/Drenaje"; "dano_mecanico" -> "Daño Mecánico"
    "maleza" -> "Maleza"; "fertilizacion" -> "Fertilización"; "suelo" -> "Suelo"
    "infraestructura" -> "Infraestructura"; "fauna" -> "Fauna"; else -> "Otro"
}

/**
 * Seguimiento de una nota: avanzar su estado y cerrarla desde el campo.
 * Funciona sin señal; el cambio se sube en cuanto hay red.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun NoteFollowUpDialog(
    note: FieldNoteEntity,
    onDismiss: () -> Unit,
    onSave: (status: String, resolutionNotes: String?) -> Unit,
) {
    var status by remember { mutableStateOf(note.status) }
    var resolution by remember { mutableStateOf(note.resolutionNotes ?: "") }
    val closing = isNoteClosed(status)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Seguimiento de la nota", color = TextPrimary, fontWeight = FontWeight.Bold) },
        text = {
            Column(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.verticalScroll(rememberScrollState()),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(getCatIcon(note.category), null, tint = getCatColor(note.category), modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(getCatLabel(note.category), color = TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                }
                Text("\"${note.description.take(200)}\"", color = TextSecondary, fontSize = 13.sp)

                Text("¿Cómo va?", color = TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    NOTE_STATUSES.forEach { (value, label) ->
                        AgraChip(
                            label = label,
                            selected = status == value,
                            onClick = { status = value },
                            color = noteStatusColor(value),
                        )
                    }
                }

                if (closing) {
                    AgraTextField(
                        value = resolution,
                        onValueChange = { resolution = it.take(2000) },
                        label = "¿Qué se hizo para resolverla?",
                        singleLine = false,
                        minLines = 2,
                    )
                }

                if (!note.isSynced) {
                    Text(
                        "Esta nota todavía no sube al servidor; el cambio viajará junto con ella.",
                        color = TextTertiary, fontSize = 11.sp,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onSave(status, resolution.ifBlank { null }) },
                enabled = status != note.status || resolution != (note.resolutionNotes ?: ""),
            ) {
                Text(
                    if (closing) "Cerrar nota" else "Guardar",
                    color = AgraGreen,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancelar", color = TextTertiary) }
        },
        containerColor = Color.White,
        shape = RoundedCornerShape(20.dp),
    )
}

@Composable
private fun DiagRow(label: String, value: String, valueColor: Color = TextPrimary) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, fontSize = 12.sp, color = TextSecondary)
        Text(value, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = valueColor)
    }
}
