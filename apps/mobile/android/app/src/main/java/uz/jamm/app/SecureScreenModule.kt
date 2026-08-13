package uz.jamm.app

import android.view.WindowManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SecureScreenModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "SecureScreen"

    @ReactMethod
    fun enable() {
        val activity = reactApplicationContext.currentActivity
        activity?.runOnUiThread {
            activity.window?.setFlags(
                WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE,
            )
        }
    }

    @ReactMethod
    fun disable() {
        val activity = reactApplicationContext.currentActivity
        activity?.runOnUiThread {
            activity.window?.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
    }
}
