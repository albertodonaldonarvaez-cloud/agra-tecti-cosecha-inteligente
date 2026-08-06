package com.agratec.fieldapp.ui.screens

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.agratec.fieldapp.data.local.entity.ParcelEntity
import com.agratec.fieldapp.data.repository.AuthRepository
import com.agratec.fieldapp.data.repository.FieldActivityRepository
import com.agratec.fieldapp.data.repository.ParcelRepository
import com.agratec.fieldapp.ui.components.GlassCard
import com.agratec.fieldapp.ui.theme.*
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Crear una actividad de la libreta de campo (offline-first).
 * Se guarda en Room y se sincroniza automáticamente cuando hay red.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun CreateActivityScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repository = remember { FieldActivityRepository(context) }
    val parcelRepository = remember { ParcelRepository(context) }
    val parcels by parcelRepository.getAllParcels().collectAsState(initial = emptyList())

    var selectedType by remember { mutableStateOf("") }
    var selectedSubtype by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var performedBy by remember { mutableStateOf(AuthRepository.getUserName(context)) }
    var isDone by remember { mutableStateOf(true) } // true = completada, false = planificada
    var selectedParcels by remember { mutableStateOf<Set<Int>>(emptySet()) }
    var isSaving by remember { mutableStateOf(false) }

    val todayStr = remember {
        SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
    }
    var activityDate by remember { mutableStateOf(todayStr) }
    var showDatePicker by remember { mutableStateOf(false) }

    if (showDatePicker) {
        val datePickerState = rememberDatePickerState()
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    datePickerState.selectedDateMillis?.let { millis ->
                        // DatePicker trabaja en UTC — formatear en UTC evita el desfase de un día
                        val fmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)
                        fmt.timeZone = TimeZone.getTimeZone("UTC")
                        activityDate = fmt.format(Date(millis))
                    }
                    showDatePicker = false
                }) { Text("Aceptar", color = AgraGreen, fontWeight = FontWeight.SemiBold) }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) { Text("Cancelar", color = TextTertiary) }
            },
        ) {
            DatePicker(state = datePickerState)
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                brush = Brush.linearGradient(
                    colors = listOf(AgraGreenSurface, AgraEmerald50, AgraTeal50),
                    start = Offset(0f, 0f),
                    end = Offset(1000f, 2000f),
                )
            ),
    ) {
        Column(Modifier.fillMaxSize()) {
            // ── Header ──
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .shadow(elevation = 2.dp, shape = RoundedCornerShape(0.dp), ambientColor = Color.Black.copy(alpha = 0.04f))
                    .background(Color.White.copy(alpha = 0.88f))
                    .statusBarsPadding()
                    .padding(horizontal = 8.dp, vertical = 8.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Volver", tint = TextPrimary)
                    }
                    Column {
                        Text("Nueva Actividad", color = TextPrimary, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                        Text("Libreta de campo", color = TextSecondary, fontSize = 12.sp)
                    }
                }
            }

            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                // ── Tipo de actividad ──
                GlassCard(modifier = Modifier.fillMaxWidth()) {
                    Text("Tipo de actividad *", color = TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(8.dp))
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        ACTIVITY_TYPES_UI.forEach { type ->
                            FilterChip(
                                selected = selectedType == type.value,
                                onClick = {
                                    selectedType = type.value
                                    selectedSubtype = ""
                                },
                                label = { Text("${type.emoji} ${type.label}", fontSize = 12.sp) },
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = type.color.copy(alpha = 0.9f),
                                    selectedLabelColor = Color.White,
                                ),
                            )
                        }
                    }

                    val subtypes = ACTIVITY_SUBTYPES_UI[selectedType].orEmpty()
                    if (subtypes.isNotEmpty()) {
                        Spacer(Modifier.height(10.dp))
                        Text("Subtipo (opcional)", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                        Spacer(Modifier.height(6.dp))
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            subtypes.forEach { sub ->
                                FilterChip(
                                    selected = selectedSubtype == sub,
                                    onClick = { selectedSubtype = if (selectedSubtype == sub) "" else sub },
                                    label = { Text(sub, fontSize = 11.sp) },
                                    colors = FilterChipDefaults.filterChipColors(
                                        selectedContainerColor = AgraGreen,
                                        selectedLabelColor = Color.White,
                                    ),
                                )
                            }
                        }
                    }
                }

                // ── Estado y fecha ──
                GlassCard(modifier = Modifier.fillMaxWidth()) {
                    Text("¿Cuándo?", color = TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(
                            selected = isDone,
                            onClick = { isDone = true },
                            label = { Text("✅ Ya realizada", fontSize = 12.sp) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = AgraGreen,
                                selectedLabelColor = Color.White,
                            ),
                        )
                        FilterChip(
                            selected = !isDone,
                            onClick = { isDone = false },
                            label = { Text("🗓️ Planificada", fontSize = 12.sp) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = StatusInProgress,
                                selectedLabelColor = Color.White,
                            ),
                        )
                    }
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(
                        value = activityDate,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Fecha") },
                        trailingIcon = {
                            IconButton(onClick = { showDatePicker = true }) {
                                Icon(Icons.Default.CalendarMonth, contentDescription = "Elegir fecha", tint = AgraGreen)
                            }
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { showDatePicker = true },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = AgraGreen,
                            unfocusedBorderColor = CardBorder,
                        ),
                    )
                }

                // ── Descripción y responsable ──
                GlassCard(modifier = Modifier.fillMaxWidth()) {
                    Text("Detalles *", color = TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = description,
                        onValueChange = { description = it },
                        label = { Text("¿Qué se hizo / se hará?") },
                        minLines = 3,
                        modifier = Modifier.fillMaxWidth(),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = AgraGreen,
                            unfocusedBorderColor = CardBorder,
                        ),
                    )
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(
                        value = performedBy,
                        onValueChange = { performedBy = it.take(255) },
                        label = { Text("Realizado por") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = AgraGreen,
                            unfocusedBorderColor = CardBorder,
                        ),
                    )
                }

                // ── Parcelas ──
                GlassCard(modifier = Modifier.fillMaxWidth()) {
                    Text("Parcelas (opcional)", color = TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(8.dp))
                    if (parcels.isEmpty()) {
                        Text(
                            "Sin parcelas en el dispositivo — se descargan al sincronizar",
                            color = TextTertiary,
                            fontSize = 12.sp,
                        )
                    } else {
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            parcels.forEach { parcel: ParcelEntity ->
                                val id = parcel.serverId
                                FilterChip(
                                    selected = selectedParcels.contains(id),
                                    onClick = {
                                        selectedParcels = if (selectedParcels.contains(id))
                                            selectedParcels - id else selectedParcels + id
                                    },
                                    label = { Text(parcel.name, fontSize = 11.sp) },
                                    colors = FilterChipDefaults.filterChipColors(
                                        selectedContainerColor = AgraGreen,
                                        selectedLabelColor = Color.White,
                                    ),
                                )
                            }
                        }
                    }
                }

                Spacer(Modifier.height(70.dp))
            }
        }

        // ── Botón Guardar ──
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(16.dp)
                .navigationBarsPadding(),
        ) {
            val canSave = selectedType.isNotBlank() && description.isNotBlank() && !isSaving
            Button(
                onClick = {
                    scope.launch {
                        isSaving = true
                        try {
                            repository.createActivity(
                                activityType = selectedType,
                                activitySubtype = selectedSubtype,
                                description = description.trim(),
                                performedBy = performedBy.trim(),
                                activityDate = activityDate,
                                status = if (isDone) "completada" else "planificada",
                                parcelIds = selectedParcels.toList(),
                            )
                            Toast.makeText(context, "Actividad guardada ✅", Toast.LENGTH_SHORT).show()
                            onBack()
                        } finally {
                            isSaving = false
                        }
                    }
                },
                enabled = canSave,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                shape = RoundedCornerShape(50),
                colors = ButtonDefaults.buttonColors(
                    containerColor = AgraGreen,
                    disabledContainerColor = AgraGreen.copy(alpha = 0.4f),
                ),
            ) {
                if (isSaving) {
                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                } else {
                    Icon(Icons.Default.Save, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Guardar Actividad", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}
