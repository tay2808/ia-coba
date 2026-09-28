package mx.cobaev.ia

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Expone RAM disponible y estado térmico al JS para ajustar la inferencia
 * (tamaño de contexto, hilos y pausas de enfriamiento).
 */
class DeviceStatsModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {

  override fun getName() = "DeviceStats"

  @ReactMethod
  fun getStats(promise: Promise) {
    try {
      val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      val mem = ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }

      val thermal = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        (context.getSystemService(Context.POWER_SERVICE) as PowerManager).currentThermalStatus
      } else {
        -1
      }

      val battery = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
      val tempTenths = battery?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -10) ?: -10

      val result = Arguments.createMap().apply {
        putDouble("totalRamMb", mem.totalMem / MB)
        putDouble("availableRamMb", mem.availMem / MB)
        putBoolean("lowMemory", mem.lowMemory)
        putInt("thermalStatus", thermal)
        putDouble("batteryTemperatureC", tempTenths / 10.0)
        putInt("cpuCores", Runtime.getRuntime().availableProcessors())
      }
      promise.resolve(result)
    } catch (e: Exception) {
      promise.reject("E_DEVICE_STATS", e)
    }
  }

  companion object {
    private const val MB = 1024.0 * 1024.0
  }
}
