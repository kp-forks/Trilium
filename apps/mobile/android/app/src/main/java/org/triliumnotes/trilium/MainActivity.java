package org.triliumnotes.trilium;

import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Window;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        WindowCompat.setDecorFitsSystemWindows(window, false);

        applySystemBarsAppearance();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        applySystemBarsAppearance();
    }

    private void applySystemBarsAppearance() {
        Window window = getWindow();
        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(window, window.getDecorView());

        boolean isNightMode = (getResources().getConfiguration().uiMode
                & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;

        // true = dark icons/text (for light backgrounds)
        // false = light icons/text (for dark backgrounds)
        controller.setAppearanceLightStatusBars(!isNightMode);
        controller.setAppearanceLightNavigationBars(!isNightMode);
    }
}
