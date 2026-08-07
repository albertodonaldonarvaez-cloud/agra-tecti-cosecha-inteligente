package com.agratec.fieldapp.ui.screens

import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.agratec.fieldapp.data.local.entity.CollaboratorEntity
import com.agratec.fieldapp.data.repository.CollaboratorRepository
import com.agratec.fieldapp.ui.components.*
import com.agratec.fieldapp.ui.theme.*
import kotlinx.coroutines.launch

/**
 * Personal de campo.
 *
 * Offline-first: con internet baja la lista del servidor (así el personal
 * dado de alta en otro teléfono aparece aquí); sin internet se puede dar de
 * alta a alguien y sube solo en cuanto vuelve la señal.
 */
@Composable
fun PersonnelScreen(
    onSync: () -> Unit,
    showCreateForm: Boolean,
    onCreateFormClosed: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repository = remember { CollaboratorRepository(context) }
    val people by repository.getAll().collectAsState(initial = emptyList())

    var search by remember { mutableStateOf("") }
    var editing by remember { mutableStateOf<CollaboratorEntity?>(null) }
    var showEditDialog by remember { mutableStateOf(false) }
    // El catálogo se relee al abrir el diálogo: puede haber crecido con el sync
    var roles by remember { mutableStateOf(repository.roles()) }

    // Al entrar: traer del servidor la lista y el catálogo de puestos
    LaunchedEffect(Unit) {
        repository.pullFromServer()
        repository.pullRoles()
        roles = repository.roles()
    }

    // El alta la abre el botón "+" de la barra (showCreateForm); la edición,
    // tocar a una persona de la lista
    val dialogOpen = showCreateForm || showEditDialog
    LaunchedEffect(showCreateForm) {
        if (showCreateForm) {
            editing = null
            roles = repository.roles()
        }
    }

    fun closeDialog() {
        showEditDialog = false
        editing = null
        if (showCreateForm) onCreateFormClosed()
    }

    val filtered = remember(people, search) {
        val q = search.trim().lowercase()
        if (q.isBlank()) people
        else people.filter {
            it.name.lowercase().contains(q) || (it.role ?: "").lowercase().contains(q)
        }
    }
    val pendingCount = people.count { !it.isSynced }

    if (dialogOpen) {
        PersonDialog(
            initial = editing,
            roles = roles,
            onDismiss = { closeDialog() },
            onSave = { name, role, phone ->
                scope.launch {
                    val current = editing
                    if (current == null) {
                        repository.addCollaborator(name, role, phone)
                        Toast.makeText(context, "Personal agregado ✅", Toast.LENGTH_SHORT).show()
                    } else {
                        repository.updateCollaborator(current.clientUuid, name, role, phone)
                        Toast.makeText(context, "Datos actualizados ✅", Toast.LENGTH_SHORT).show()
                    }
                    roles = repository.roles()
                    closeDialog()
                }
            },
        )
    }

    Column(Modifier.fillMaxSize()) {
        AgraHeader(
            title = "Personal",
            subtitle = "${people.size} persona${if (people.size == 1) "" else "s"} de campo",
            emoji = "👷",
            badge = if (pendingCount > 0) "$pendingCount sin subir" else null,
            actions = { AgraSyncAction(unsyncedCount = pendingCount, onClick = onSync) },
        )

        if (people.size > 6) {
            OutlinedTextField(
                value = search,
                onValueChange = { search = it },
                placeholder = { Text("Buscar por nombre o puesto", color = TextTertiary, fontSize = 13.sp) },
                singleLine = true,
                shape = RoundedCornerShape(50),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = AgraGreen,
                    unfocusedBorderColor = CardBorder,
                    focusedContainerColor = Color.White.copy(alpha = 0.7f),
                    unfocusedContainerColor = Color.White.copy(alpha = 0.6f),
                ),
            )
        }

        if (filtered.isEmpty()) {
            AgraEmptyState(
                emoji = "👷",
                title = if (people.isEmpty()) "Todavía no hay personal" else "Nadie coincide con la búsqueda",
                message = if (people.isEmpty())
                    "Da de alta a tu gente de campo para asignarla en las actividades y saber quién hizo cada labor."
                else "Prueba con otro nombre o puesto.",
                modifier = Modifier.weight(1f),
            )
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 160.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(filtered, key = { it.id }) { person ->
                    PersonCard(person) {
                        editing = person
                        roles = repository.roles()
                        showEditDialog = true
                    }
                }
            }
        }
    }
}

@Composable
private fun PersonCard(person: CollaboratorEntity, onClick: () -> Unit) {
    GlassCard(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(Brush.linearGradient(listOf(AgraGreenLight, AgraEmerald600))),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    person.name.trim().take(1).uppercase(),
                    color = Color.White,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    person.name,
                    color = TextPrimary,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (!person.role.isNullOrBlank()) {
                    Spacer(Modifier.height(3.dp))
                    StatusBadge(text = person.role, color = AgraEmerald600)
                }
                if (!person.phone.isNullOrBlank()) {
                    Spacer(Modifier.height(4.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Phone, contentDescription = null, tint = TextTertiary, modifier = Modifier.size(12.dp))
                        Spacer(Modifier.width(4.dp))
                        Text(person.phone, color = TextTertiary, fontSize = 12.sp)
                    }
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                AgraSyncDot(person.isSynced)
                if (!person.isSynced) {
                    Spacer(Modifier.height(4.dp))
                    Text("Pendiente", color = SyncPending, fontSize = 10.sp, fontWeight = FontWeight.Medium)
                }
            }
        }
    }
}

/**
 * Alta y edición de una persona.
 * El puesto sale del catálogo del servidor; con "Otro" se escribe a mano y
 * queda registrado tanto en el teléfono como en el servidor al sincronizar.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PersonDialog(
    initial: CollaboratorEntity?,
    roles: List<String>,
    onDismiss: () -> Unit,
    onSave: (name: String, role: String?, phone: String?) -> Unit,
) {
    var name by remember { mutableStateOf(initial?.name ?: "") }
    var phone by remember { mutableStateOf(initial?.phone ?: "") }
    // Un puesto que no está en el catálogo se edita como texto libre
    val startsCustom = !initial?.role.isNullOrBlank() && roles.none { it.equals(initial?.role, true) }
    var customRole by remember { mutableStateOf(startsCustom) }
    var selectedRole by remember { mutableStateOf(if (startsCustom) "" else initial?.role ?: "") }
    var typedRole by remember { mutableStateOf(if (startsCustom) initial?.role ?: "" else "") }

    val effectiveRole = if (customRole) typedRole.trim() else selectedRole

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                if (initial == null) "Nuevo personal" else "Editar personal",
                color = TextPrimary,
                fontWeight = FontWeight.Bold,
            )
        },
        text = {
            Column(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.verticalScroll(rememberScrollState()),
            ) {
                AgraTextField(
                    value = name,
                    onValueChange = { name = it.take(255) },
                    label = "Nombre completo *",
                )
                AgraTextField(
                    value = phone,
                    onValueChange = { phone = it.take(32) },
                    label = "Teléfono (opcional)",
                    keyboardType = KeyboardType.Phone,
                )

                Text("Puesto", color = TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    roles.forEach { role ->
                        AgraChip(
                            label = role,
                            selected = !customRole && selectedRole == role,
                            onClick = {
                                customRole = false
                                selectedRole = if (selectedRole == role) "" else role
                            },
                        )
                    }
                    AgraChip(
                        label = "✏️ Otro",
                        selected = customRole,
                        onClick = { customRole = true; selectedRole = "" },
                        color = AgraEmerald600,
                    )
                }
                if (customRole) {
                    AgraTextField(
                        value = typedRole,
                        onValueChange = { typedRole = it.take(128) },
                        label = "Escribe el puesto",
                    )
                    Text(
                        "Se guardará en el catálogo y aparecerá también en la computadora y en los demás teléfonos.",
                        color = TextTertiary,
                        fontSize = 11.sp,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onSave(name, effectiveRole.ifBlank { null }, phone.ifBlank { null }) },
                enabled = name.isNotBlank() && (!customRole || typedRole.isNotBlank()),
            ) {
                Text("Guardar", color = AgraGreen, fontWeight = FontWeight.SemiBold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancelar", color = TextTertiary) }
        },
        containerColor = Color.White,
        shape = RoundedCornerShape(20.dp),
    )
}
