<?php
/**
 * Plugin Name: FAQ Chat Widget (snippet)
 * Description: Loads the FAQ Chat Widget on every public page. Copy to wp-content/mu-plugins/ or paste into a code snippets plugin.
 * Author: Saizul Amin
 * License: MIT
 */

if (!defined('ABSPATH')) {
    exit;
}

add_action('wp_footer', function () {
    if (is_admin()) {
        return;
    }
    // Upload faq-chat-widget.min.js and faq.json to your uploads folder (or any HTTPS URL).
    $base = content_url('/uploads/faq-chat');
    printf(
        '<script src="%s" defer data-faq-url="%s" data-lang="auto" data-theme="auto" data-primary="#0b7a5b" data-whatsapp="%s"></script>',
        esc_url($base . '/faq-chat-widget.min.js'),
        esc_url($base . '/faq.json'),
        esc_attr('8801XXXXXXXXX') // your WhatsApp number, digits only. No secrets here: this is public HTML.
    );
}, 20);
