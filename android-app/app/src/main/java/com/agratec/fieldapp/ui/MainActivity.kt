package com.agratec.fieldapp.ui

import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.agratec.fieldapp.data.prefs.PhotoStats
import com.agratec.fieldapp.data.prefs.SyncPreferences
import com.agratec.fieldapp.data.repository.AuthRepository
import com.agratec.fieldapp.data.repository.UpdateRepository
import com.agratec.fieldapp.sync.NetworkUtils
import com.agratec.fieldapp.sync.SyncNotifier
import com.agratec.fieldapp.sync.SyncStatus
import com.agratec.fieldapp.sync.SyncWorker
import com.agratec.fieldapp.ui.components.AgraCreateButton
import com.agratec.fieldapp.ui.components.AgraNavBar
import com.agratec.fieldapp.ui.components.AgraScreen
import com.agratec.fieldapp.ui.components.AgraTab
import com.agratec.fieldapp.ui.components.PhotoPolicyDialog
import com.agratec.fieldapp.ui.components.SettingsDialog
import com.agratec.fieldapp.ui.screens.ActivitiesListScreen
import com.agratec.fieldapp.ui.screens.CreateActivityScreen
import com.agratec.fieldapp.ui.screens.CreateNoteScreen
import com.agratec.fieldapp.ui.screens.LoginScreen
import com.agratec.fieldapp.ui.screens.NotesListScreen
import com.agratec.fieldapp.ui.screens.PersonnelScreen
import com.agratec.fieldapp.ui.screens.WarehouseScreen
import com.agratec.fieldapp.util.AppLogger
import com.agratec.fieldapp.ui.theme.AgraFieldTheme
import com.agratec.fieldapp.ui.theme.AgraGreen
import com.agratec.fieldapp.ui.theme.TextPrimary
import com.agratec.fieldapp.ui.theme.TextSecondary
import com.agratec.fieldapp.ui.theme.TextTertiary
import kotlinx.coroutines.launch

/**
 * Activity principal.
 *
 * La app tiene cuatro secciones fijas —Notas, Libreta, Personal y Almacén—
 * dentro de un mismo marco: fondo, encabezado y barra de navegación comunes.
 * Las pantallas de captura (nueva nota / nueva actividad) entran encima.
 *
 * Lo transversal (sincronizar, ajustes, actualizaciones, sesión) vive aquí,
 * para que se comporte igual en todas las secciones.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            AgraFieldTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = Color.Transparent,
                ) {
                    AppNavigation()
                }
            }
        }
    }
}

enum class Screen { Login, Main, CreateNote, CreateActivity }

@Composable
fun AppNavigation() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val authRepository = remember { AuthRepository(context) }
    val updateRepository = remember { UpdateRepository(context) }

    // rememberSaveable: sobrevivir rotación/muerte de proceso (común al abrir la cámara)
    var currentScreen by rememberSaveable {
        mutableStateOf(if (authRepository.isLoggedIn()) Screen.Main else Screen.Login)
    }
    var currentTab by rememberSaveable { mutableStateOf(AgraTab.Libreta) }

    // Alta de personal/producto: el estado vive aquí (no en la pantalla) para
    // que cambiar de sección y volver no reabra el diálogo por su cuenta
    var showPersonForm by remember { mutableStateOf(false) }
    var showProductForm by remember { mutableStateOf(false) }

    val syncStatus by SyncStatus.state.collectAsState()

    // ── Ajustes (fotos, versión, cerrar sesión) ──
    var showSettings by remember { mutableStateOf(false) }
    var uploadOnMobile by remember {
        mutableStateOf(SyncPreferences.uploadPolicy(context) == SyncPreferences.Policy.ALLOW)
    }
    var downloadOnMobile by remember {
        mutableStateOf(SyncPreferences.downloadPolicy(context) == SyncPreferences.Policy.ALLOW)
    }
    var showPhotoPolicyDialog by remember { mutableStateOf(false) }
    var checkingUpdate by remember { mutableStateOf(false) }
    var dataSaver by remember { mutableStateOf(SyncPreferences.dataSaver(context)) }
    var photoStats by remember { mutableStateOf(PhotoStats.read(context)) }
    var pendingUploads by remember { mutableIntStateOf(0) }

    // Permiso de notificaciones: es lo que permite avisar del progreso de la
    // subida cuando el usuario ya salió de la app (Android 13+ lo pide aparte)
    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { /* si lo niega, la subida sigue igual: solo se queda sin aviso */ }
    LaunchedEffect(currentScreen) {
        if (currentScreen == Screen.Main &&
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            !SyncNotifier.puedeNotificar(context)
        ) {
            notificationPermissionLauncher.launch(android.Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    // Cada vez que se abren los ajustes, números frescos
    LaunchedEffect(showSettings) {
        if (!showSettings) return@LaunchedEffect
        photoStats = PhotoStats.read(context)
        val db = com.agratec.fieldapp.data.local.AppDatabase.getInstance(context)
        pendingUploads = com.agratec.fieldapp.data.repository.FieldNoteRepository(context).getUnsyncedNoteCount() +
            db.fieldActivityDao().getUnsyncedCount() +
            db.photoDao().getUnsyncedCount() +
            db.activityPhotoDao().getUnsyncedCount() +
            db.productDao().getUnsyncedCount() +
            db.productDao().getPendingPhotoCount()
    }

    // Cambiar de sección queda registrado: así se sabe qué usa la cuadrilla
    LaunchedEffect(currentTab, currentScreen) {
        if (currentScreen == Screen.Main) {
            AppLogger.log(context, AppLogger.SCREEN_VIEW, currentTab.label, "Abrió la sección ${currentTab.label}")
        }
    }

    // ── Actualización de la app ──
    var updateInfo by remember { mutableStateOf<UpdateRepository.UpdateInfo?>(null) }
    LaunchedEffect(Unit) {
        SyncStatus.load(context)
        updateInfo = updateRepository.checkForUpdate()
    }

    // Con datos móviles y sin haber preguntado nunca: definir qué hacer con las fotos
    LaunchedEffect(currentScreen) {
        if (currentScreen != Screen.Main) return@LaunchedEffect
        val onMobile = !NetworkUtils.isUnmetered(context) && NetworkUtils.isConnected(context)
        if (onMobile && !SyncPreferences.hasBeenAsked(context)) showPhotoPolicyDialog = true
    }

    // ── Sesión caducada: si ya no se pudo renovar sola, mandar al login ──
    // (la renovación automática ocurre en RetrofitClient; esto es el último recurso)
    var sessionExpiredNotice by remember { mutableStateOf(false) }
    LaunchedEffect(currentScreen) {
        if (currentScreen != Screen.Login && authRepository.sessionExpired()) {
            sessionExpiredNotice = true
            currentScreen = Screen.Login
        }
    }
    LaunchedEffect(Unit) {
        while (true) {
            kotlinx.coroutines.delay(30_000)
            if (currentScreen != Screen.Login && authRepository.sessionExpired()) {
                sessionExpiredNotice = true
                currentScreen = Screen.Login
            }
        }
    }

    /** Sincronización manual: intención explícita del usuario */
    val runManualSync: () -> Unit = {
        scope.launch {
            com.agratec.fieldapp.data.repository.FieldActivityRepository(context)
                .resetFailedSyncAttempts()
            SyncWorker.enqueueImmediateSync(context)
            val mensaje = when (NetworkUtils.currentType(context)) {
                NetworkUtils.NetworkType.NONE -> "Sin conexión: se sincronizará al recuperar señal"
                NetworkUtils.NetworkType.WIFI -> "Sincronizando por WiFi (datos y fotos)..."
                NetworkUtils.NetworkType.MOBILE ->
                    if (uploadOnMobile) "Sincronizando por datos (datos y fotos)..."
                    else "Sincronizando datos... las fotos esperarán WiFi"
            }
            Toast.makeText(context, mensaje, Toast.LENGTH_SHORT).show()
        }
    }

    // ── Diálogos transversales ──

    if (showPhotoPolicyDialog) {
        PhotoPolicyDialog(
            pendingPhotos = syncStatus?.photosWaitingForWifi ?: 0,
            onDecide = { allowUpload, allowDownload ->
                SyncPreferences.setUploadPolicy(context, if (allowUpload) SyncPreferences.Policy.ALLOW else SyncPreferences.Policy.WIFI_ONLY)
                SyncPreferences.setDownloadPolicy(context, if (allowDownload) SyncPreferences.Policy.ALLOW else SyncPreferences.Policy.WIFI_ONLY)
                SyncPreferences.markAsked(context)
                uploadOnMobile = allowUpload
                downloadOnMobile = allowDownload
                showPhotoPolicyDialog = false
                SyncWorker.enqueueImmediateSync(context)
            },
            onDismiss = {
                SyncPreferences.markAsked(context)
                showPhotoPolicyDialog = false
            },
        )
    }

    if (showSettings) {
        SettingsDialog(
            uploadOnMobile = uploadOnMobile,
            downloadOnMobile = downloadOnMobile,
            onChange = { up, down ->
                SyncPreferences.setUploadPolicy(context, if (up) SyncPreferences.Policy.ALLOW else SyncPreferences.Policy.WIFI_ONLY)
                SyncPreferences.setDownloadPolicy(context, if (down) SyncPreferences.Policy.ALLOW else SyncPreferences.Policy.WIFI_ONLY)
                SyncPreferences.markAsked(context)
                uploadOnMobile = up
                downloadOnMobile = down
            },
            onDismiss = { showSettings = false },
            appVersion = updateRepository.currentVersionLabel(),
            checkingUpdate = checkingUpdate,
            onCheckUpdate = {
                scope.launch {
                    checkingUpdate = true
                    when (val result = updateRepository.check()) {
                        is UpdateRepository.CheckResult.Available -> {
                            updateInfo = result.info
                            showSettings = false
                        }
                        is UpdateRepository.CheckResult.UpToDate ->
                            Toast.makeText(context, "Ya tienes la última versión (${result.currentVersion})", Toast.LENGTH_LONG).show()
                        is UpdateRepository.CheckResult.Error ->
                            Toast.makeText(context, "No se pudo revisar: ${result.message}", Toast.LENGTH_LONG).show()
                    }
                    checkingUpdate = false
                }
            },
            onLogout = {
                showSettings = false
                scope.launch {
                    // logout sube primero la bitácora pendiente; después ya no
                    // habría token para saber de quién era
                    authRepository.logout()
                    currentScreen = Screen.Login
                }
            },
            dataSaver = dataSaver,
            onDataSaverChange = {
                SyncPreferences.setDataSaver(context, it)
                dataSaver = it
            },
            photoStats = photoStats,
            pendingUploads = pendingUploads,
        )
    }

    if (sessionExpiredNotice) {
        AlertDialog(
            onDismissRequest = {
                authRepository.consumeSessionExpired()
                sessionExpiredNotice = false
            },
            title = { Text("Sesión finalizada", color = TextPrimary, fontWeight = FontWeight.Bold) },
            text = {
                Text(
                    "Por seguridad tu sesión terminó. Vuelve a iniciar sesión para seguir sincronizando.\n\n" +
                        "Nada de lo que capturaste se pierde: queda guardado en el teléfono y se subirá al entrar.",
                    color = TextSecondary,
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    authRepository.consumeSessionExpired()
                    sessionExpiredNotice = false
                }) {
                    Text("Iniciar sesión", color = AgraGreen, fontWeight = FontWeight.SemiBold)
                }
            },
            containerColor = Color.White,
            shape = RoundedCornerShape(20.dp),
        )
    }

    updateInfo?.let { info ->
        AlertDialog(
            onDismissRequest = { updateInfo = null },
            title = { Text("🚀 Nueva versión disponible", color = TextPrimary, fontWeight = FontWeight.Bold) },
            text = {
                Text(
                    buildString {
                        append("Hay una versión nueva de la app: v${info.versionName}")
                        info.fileSizeMb?.let { append(" (${String.format(java.util.Locale.US, "%.1f", it)} MB)") }
                        append(".\n")
                        if (!info.notes.isNullOrBlank()) append("\n${info.notes}\n")
                        append("\nSe descargará con el navegador; al terminar, ábrela para instalarla.")
                    },
                    color = TextSecondary,
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    updateRepository.openDownload(info)
                    updateInfo = null
                }) {
                    Text("Descargar", color = AgraGreen, fontWeight = FontWeight.SemiBold)
                }
            },
            dismissButton = {
                TextButton(onClick = { updateInfo = null }) { Text("Después", color = TextTertiary) }
            },
            containerColor = Color.White,
            shape = RoundedCornerShape(20.dp),
        )
    }

    // ── Navegación ──
    AnimatedContent(
        targetState = currentScreen,
        transitionSpec = {
            when (targetState) {
                // Las pantallas de captura entran desde la derecha; volver, al revés
                Screen.CreateNote, Screen.CreateActivity ->
                    slideInHorizontally { it } + fadeIn() togetherWith
                            slideOutHorizontally { -it / 3 } + fadeOut()
                Screen.Main -> if (initialState == Screen.CreateNote || initialState == Screen.CreateActivity) {
                    slideInHorizontally { -it / 3 } + fadeIn() togetherWith
                            slideOutHorizontally { it } + fadeOut()
                } else {
                    fadeIn() togetherWith fadeOut()
                }
                Screen.Login -> fadeIn() togetherWith fadeOut()
            }
        },
        label = "screenTransition",
    ) { screen ->
        when (screen) {
            Screen.Login -> LoginScreen(
                onLoginSuccess = { currentScreen = Screen.Main }
            )

            Screen.Main -> AgraScreen {
                when (currentTab) {
                    AgraTab.Notas -> NotesListScreen(
                        onSync = runManualSync,
                        onOpenSettings = { showSettings = true },
                    )
                    AgraTab.Libreta -> ActivitiesListScreen(
                        onSync = runManualSync,
                        onOpenSettings = { showSettings = true },
                    )
                    AgraTab.Personal -> PersonnelScreen(
                        onSync = runManualSync,
                        showCreateForm = showPersonForm,
                        onCreateFormClosed = { showPersonForm = false },
                    )
                    AgraTab.Almacen -> WarehouseScreen(
                        onSync = runManualSync,
                        showCreateForm = showProductForm,
                        onCreateFormClosed = { showProductForm = false },
                    )
                }

                // Botón de crear de la sección actual, sobre la barra
                AgraCreateButton(
                    label = currentTab.createLabel,
                    onClick = {
                        when (currentTab) {
                            AgraTab.Notas -> currentScreen = Screen.CreateNote
                            AgraTab.Libreta -> currentScreen = Screen.CreateActivity
                            AgraTab.Personal -> showPersonForm = true
                            AgraTab.Almacen -> showProductForm = true
                        }
                    },
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(end = 20.dp, bottom = 92.dp)
                        .navigationBarsPadding(),
                )

                AgraNavBar(
                    current = currentTab,
                    onSelect = { currentTab = it },
                    modifier = Modifier.align(Alignment.BottomCenter),
                )
            }

            Screen.CreateNote -> CreateNoteScreen(
                onBack = { currentScreen = Screen.Main }
            )

            Screen.CreateActivity -> CreateActivityScreen(
                onBack = { currentScreen = Screen.Main }
            )
        }
    }
}
