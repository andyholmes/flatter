// SPDX-License-Identifier: CC0-1.0
// SPDX-FileCopyrightText: No rights reserved

#include <stdlib.h>

#include <gio/gio.h>
#include <gtk/gtk.h>

int
main (int   argc,
      char *argv[])
{
  GMainLoop *loop;
  GtkWindow *window;

  gtk_init ();

  loop = g_main_loop_new (NULL, FALSE);
  window = g_object_new (GTK_TYPE_WINDOW,
                         "title", "Flatter",
                         "child", g_object_new (GTK_TYPE_LABEL,
                                                "label",      "This is a test application for "
                                                              "<a href='https://flatter.andyholmes.ca'>Flatter</a>.",
                                                "use-markup", TRUE,
                                                NULL),
                         "default-height", 480,
                         "default-width",  600,
                         NULL);
  g_signal_connect_swapped (window,
                            "destroy",
                            G_CALLBACK (g_main_loop_quit),
                            loop);
  gtk_window_present (window);
#ifdef FLATTER_TEST
  g_timeout_add_seconds_once (1, (GSourceOnceFunc)gtk_window_destroy, window);
#endif
  g_main_loop_run (loop);
  g_main_loop_unref (loop);

#ifdef FLATTER_FAILURE
  return EXIT_FAILURE;
#else
  return EXIT_SUCCESS;
#endif
}

