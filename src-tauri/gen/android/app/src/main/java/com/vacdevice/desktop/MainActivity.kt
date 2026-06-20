package com.vacdevice.desktop

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import android.content.pm.PackageManager

class MainActivity : TauriActivity() {
    private val requestPermissions = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val allGranted = permissions.all { it.value }
        if (allGranted) {
            android.util.Log.i("BLE", "All BLE permissions granted")
        } else {
            android.util.Log.w("BLE", "Some BLE permissions denied: ${permissions.filter { !it.value }.keys}")
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        requestBlePermissions()
    }

    private fun requestBlePermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // Android 12+
            val requiredPerms = arrayOf(
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT
            )
            val needRequest = requiredPerms.any {
                ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
            }
            if (needRequest) {
                requestPermissions.launch(requiredPerms)
            }
        } else {
            // Android 11 and below
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED
            ) {
                requestPermissions.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION))
            }
        }
    }
}
