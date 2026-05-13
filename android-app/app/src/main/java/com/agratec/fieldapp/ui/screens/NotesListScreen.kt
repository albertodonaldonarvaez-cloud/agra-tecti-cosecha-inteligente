package com.agratec.fieldapp.ui.screens

import androidx.compose.animation.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.agratec.fieldapp.R
import com.agratec.fieldapp.data.local.entity.FieldNoteEntity
import com.agratec.fieldapp.data.repository.FieldNoteRepository
import com.agratec.fieldapp.sync.SyncWorker
import com.agratec.fieldapp.ui.components.AgraBottomBar
import com.agratec.fieldapp.ui.components.GlassCard
import com.agratec.fieldapp.ui.components.StatCard
import com.agratec.fieldapp.ui.components.StatusBadge
import com.agratec.fieldapp.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotesListScreen(onCreateNote: () -> Unit, onLogout: () -> Unit) {
    val context = LocalContext.current
    val repository = remember { FieldNoteRepository(context) }
    val notes by repository.getAllNotes().collectAsState(initial = emptyList())
    var unsyncedCount by remember { mutableIntStateOf(0) }
    var showLogoutDialog by remember { mutableStateOf(false) }

    LaunchedEffect(notes) { unsyncedCount = repository.getUnsyncedNoteCount() }

    // Compute stats from local notes
    val syncedCount = notes.count { it.isSynced }
    val pendingCount = notes.count { !it.isSynced }
    val criticalCount = notes.count { it.severity == "critica" }
    val highCount = notes.count { it.severity == "alta" }

    if (showLogoutDialog) {
        AlertDialog(
            onDismissRequest = { showLogoutDialog = false },
            title = {
                Text(
                    "Cerrar Sesión",
                    color = TextPrimary,
                    fontWeight = FontWeight.Bold,
                )
            },
            text = {
                Text(
                    if (unsyncedCount > 0) "Tienes $unsyncedCount nota(s) sin sincronizar. ¿Continuar?"
                    else "¿Seguro que deseas cerrar sesión?",
                    color = TextSecondary,
                )
            },
            confirmButton = {
                TextButton(onClick = { showLogoutDialog = false; onLogout() }) {
                    Text("Salir", color = SeverityCritical, fontWeight = FontWeight.SemiBold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showLogoutDialog = false }) {
                    Text("Cancelar", color = AgraGreen, fontWeight = FontWeight.SemiBold)
                }
            },
            containerColor = Color.White,
            shape = RoundedCornerShape(20.dp),
        )
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                brush = Brush.linearGradient(
                    colors = listOf(
                        AgraGreenSurface,
                        AgraEmerald50,
                        AgraTeal50,
                    ),
                    start = Offset(0f, 0f),
                    end = Offset(Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY),
                )
            ),
    ) {
        Column(Modifier.fillMaxSize()) {
            // ── Top App Bar with glassmorphism ──
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .shadow(
                        elevation = 2.dp,
                        shape = RoundedCornerShape(0.dp),
                        ambientColor = Color.Black.copy(alpha = 0.04f),
                    )
                    .background(Color.White.copy(alpha = 0.88f))
                    .statusBarsPadding()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Image(
                        painter = painterResource(R.drawable.agratectilogo),
                        contentDescription = null,
                        modifier = Modifier
                            .size(36.dp)
                            .clip(RoundedCornerShape(8.dp)),
                    )
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(
                            "Notas de Campo",
                            fontSize = 19.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextPrimary,
                        )
                        Text(
                            "${notes.size} notas • $unsyncedCount pendientes",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Medium,
                            color = AgraGreen.copy(alpha = 0.7f),
                        )
                    }
                }
            }

            // ── Content ──
            LazyColumn(
                contentPadding = PaddingValues(
                    start = 16.dp,
                    end = 16.dp,
                    top = 12.dp,
                    bottom = 100.dp, // space for bottom bar
                ),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxSize(),
            ) {
                // Stats row
                item {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        StatCard(
                            label = "Total",
                            value = notes.size,
                            icon = Icons.Default.Description,
                            iconColor = AgraGreen,
                            iconBgColor = AgraGreen.copy(alpha = 0.12f),
                            modifier = Modifier.weight(1f),
                        )
                        StatCard(
                            label = "Pendientes",
                            value = pendingCount,
                            icon = Icons.Default.CloudUpload,
                            iconColor = SyncPending,
                            iconBgColor = SyncPending.copy(alpha = 0.12f),
                            modifier = Modifier.weight(1f),
                        )
                        StatCard(
                            label = "Críticas",
                            value = criticalCount + highCount,
                            icon = Icons.Default.Warning,
                            iconColor = SeverityCritical,
                            iconBgColor = SeverityCritical.copy(alpha = 0.12f),
                            modifier = Modifier.weight(1f),
                        )
                    }
                }

                // Empty state
                if (notes.isEmpty()) {
                    item {
                        Column(
                            Modifier
                                .fillParentMaxHeight(0.6f)
                                .fillMaxWidth(),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center,
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(72.dp)
                                    .clip(RoundedCornerShape(20.dp))
                                    .background(Color(0xFFF3F4F6)),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(
                                    Icons.Default.NoteAdd,
                                    null,
                                    Modifier.size(36.dp),
                                    tint = TextTertiary.copy(alpha = 0.4f),
                                )
                            }
                            Spacer(Modifier.height(16.dp))
                            Text(
                                "No hay notas de campo",
                                fontSize = 16.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = TextSecondary,
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(
                                "Crea una nueva nota para reportar observaciones",
                                fontSize = 13.sp,
                                color = TextTertiary,
                            )
                        }
                    }
                }

                // Note cards
                items(notes, key = { it.id }) { note ->
                    NoteCard(note)
                }
            }
        }

        // ── Floating bottom bar ──
        AgraBottomBar(
            unsyncedCount = unsyncedCount,
            onSync = { SyncWorker.enqueueImmediateSync(context) },
            onCreateNote = onCreateNote,
            onLogout = { showLogoutDialog = true },
            modifier = Modifier.align(Alignment.BottomCenter),
        )
    }
}

@Composable
private fun NoteCard(note: FieldNoteEntity) {
    val catColor = getCatColor(note.category)
    val isHighPriority = note.severity == "critica" || note.severity == "alta"

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(
                elevation = 3.dp,
                shape = RoundedCornerShape(20.dp),
                ambientColor = Color.Black.copy(alpha = 0.06f),
            )
            .clip(RoundedCornerShape(20.dp))
            .background(Color.White.copy(alpha = 0.75f))
            .border(
                width = 0.5.dp,
                color = CardBorder.copy(alpha = 0.4f),
                shape = RoundedCornerShape(20.dp),
            )
            // Priority indicator bar on the left
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
        // Glass shine
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.linearGradient(
                        colors = listOf(
                            Color.White.copy(alpha = 0.3f),
                            Color.Transparent,
                        ),
                        start = Offset.Zero,
                        end = Offset(Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY),
                    )
                )
        )

        Row(
            Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.Top,
        ) {
            // Category icon
            Box(
                Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(catColor.copy(alpha = 0.1f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    getCatIcon(note.category),
                    null,
                    tint = catColor,
                    modifier = Modifier.size(22.dp),
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                // Top row: category label + badges
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        getCatLabel(note.category),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = TextPrimary,
                    )
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
                }

                Spacer(Modifier.height(6.dp))

                // Description
                Text(
                    note.description,
                    fontSize = 13.sp,
                    color = TextSecondary,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    lineHeight = 18.sp,
                )

                Spacer(Modifier.height(10.dp))

                // Footer: folio + sync status
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    // Folio badge
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(Color(0xFFF3F4F6))
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            Icons.Default.Tag,
                            null,
                            tint = TextTertiary,
                            modifier = Modifier.size(10.dp),
                        )
                        Spacer(Modifier.width(3.dp))
                        Text(
                            note.folio.take(8),
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Medium,
                            color = TextTertiary,
                        )
                    }

                    // Sync badge
                    StatusBadge(
                        text = if (note.isSynced) "Sincronizado" else "Pendiente",
                        color = if (note.isSynced) SyncOk else SyncPending,
                        showDot = true,
                        backgroundColor = if (note.isSynced) SyncOk.copy(alpha = 0.06f) else SyncPending.copy(alpha = 0.06f),
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
