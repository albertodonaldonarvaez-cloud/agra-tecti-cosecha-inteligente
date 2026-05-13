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
import com.agratec.fieldapp.ui.components.GlassCard
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

    if (showLogoutDialog) {
        AlertDialog(
            onDismissRequest = { showLogoutDialog = false },
            title = { Text("Cerrar Sesión", color = TextPrimary) },
            text = {
                Text(
                    if (unsyncedCount > 0) "Tienes $unsyncedCount nota(s) sin sincronizar. ¿Continuar?"
                    else "¿Seguro que deseas cerrar sesión?",
                    color = TextSecondary,
                )
            },
            confirmButton = {
                TextButton(onClick = { showLogoutDialog = false; onLogout() }) {
                    Text("Salir", color = SeverityCritical)
                }
            },
            dismissButton = {
                TextButton(onClick = { showLogoutDialog = false }) {
                    Text("Cancelar", color = AgraGreen)
                }
            },
            containerColor = Color.White,
        )
    }

    Scaffold(
        containerColor = LightBg1,
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Image(
                            painter = painterResource(R.drawable.agratectilogo),
                            contentDescription = null,
                            modifier = Modifier.size(32.dp),
                        )
                        Spacer(Modifier.width(10.dp))
                        Column {
                            Text(
                                "Notas de Campo",
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold,
                                color = TextPrimary,
                            )
                            Text(
                                "${notes.size} notas • $unsyncedCount pendientes",
                                fontSize = 11.sp,
                                color = AgraGreenDark.copy(alpha = 0.6f),
                            )
                        }
                    }
                },
                actions = {
                    IconButton(onClick = { SyncWorker.enqueueImmediateSync(context) }) {
                        BadgedBox(badge = {
                            if (unsyncedCount > 0) Badge(
                                containerColor = SyncPending,
                                contentColor = Color.White,
                            ) {
                                Text("$unsyncedCount", fontSize = 10.sp)
                            }
                        }) {
                            Icon(
                                Icons.Default.CloudUpload,
                                "Sincronizar",
                                tint = if (unsyncedCount > 0) SyncPending else TextTertiary,
                            )
                        }
                    }
                    IconButton(onClick = { showLogoutDialog = true }) {
                        Icon(Icons.Default.Logout, "Cerrar sesión", tint = TextTertiary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.White.copy(alpha = 0.9f),
                ),
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = onCreateNote,
                containerColor = AgraGreen,
                contentColor = Color.White,
                shape = RoundedCornerShape(16.dp),
            ) {
                Icon(Icons.Default.Add, null)
                Spacer(Modifier.width(8.dp))
                Text("Nueva Nota", fontWeight = FontWeight.SemiBold)
            }
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            if (notes.isEmpty()) {
                Column(
                    Modifier
                        .fillMaxSize()
                        .padding(48.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Icon(
                        Icons.Default.NoteAdd,
                        null,
                        Modifier.size(80.dp),
                        tint = TextTertiary.copy(alpha = 0.3f),
                    )
                    Spacer(Modifier.height(16.dp))
                    Text(
                        "Sin notas de campo",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Medium,
                        color = TextTertiary,
                    )
                    Text(
                        "Toca + para crear tu primera observación",
                        fontSize = 13.sp,
                        color = TextTertiary.copy(alpha = 0.5f),
                    )
                }
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(notes, key = { it.id }) { note -> NoteCard(note) }
                    item { Spacer(Modifier.height(80.dp)) }
                }
            }
        }
    }
}

@Composable
private fun NoteCard(note: FieldNoteEntity) {
    GlassCard(Modifier.fillMaxWidth(), cornerRadius = 16.dp) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            Box(
                Modifier
                    .size(42.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(getCatColor(note.category).copy(alpha = 0.1f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    getCatIcon(note.category),
                    null,
                    tint = getCatColor(note.category),
                    modifier = Modifier.size(22.dp),
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        getCatLabel(note.category),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = TextPrimary,
                    )
                    Spacer(Modifier.width(8.dp))
                    val sc = when (note.severity) {
                        "critica" -> SeverityCritical
                        "alta" -> SeverityHigh
                        "media" -> SeverityMedium
                        else -> SeverityLow
                    }
                    Box(
                        Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(sc.copy(alpha = 0.1f))
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                    ) {
                        Text(
                            note.severity.replaceFirstChar { c -> c.uppercase() },
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Medium,
                            color = sc,
                        )
                    }
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    note.description,
                    fontSize = 13.sp,
                    color = TextSecondary,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(8.dp))
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        note.folio.take(8) + "...",
                        fontSize = 11.sp,
                        color = TextTertiary,
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(if (note.isSynced) SyncOk else SyncPending),
                        )
                        Spacer(Modifier.width(4.dp))
                        Text(
                            if (note.isSynced) "Sincronizado" else "Pendiente",
                            fontSize = 11.sp,
                            color = if (note.isSynced) SyncOk else SyncPending,
                        )
                    }
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
    "plaga_enfermedad" -> SeverityCritical; "riego_drenaje" -> Color(0xFF3B82F6)
    "dano_mecanico" -> SeverityHigh; "maleza" -> AgraGreenLight
    "fertilizacion" -> Color(0xFF8B5CF6); "suelo" -> Color(0xFF92400E)
    "infraestructura" -> Color(0xFF64748B); "fauna" -> Color(0xFFF59E0B)
    "arboles_mal_plantados" -> AgraGreen; else -> Color(0xFF94A3B8)
}
private fun getCatLabel(c: String): String = when (c) {
    "arboles_mal_plantados" -> "Árboles"; "plaga_enfermedad" -> "Plaga/Enfermedad"
    "riego_drenaje" -> "Riego/Drenaje"; "dano_mecanico" -> "Daño Mecánico"
    "maleza" -> "Maleza"; "fertilizacion" -> "Fertilización"; "suelo" -> "Suelo"
    "infraestructura" -> "Infraestructura"; "fauna" -> "Fauna"; else -> "Otro"
}
