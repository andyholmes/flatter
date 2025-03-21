// SPDX-License-Identifier: CC0-1.0
// SPDX-FileCopyrightText: No rights reserved

#include <stdlib.h>

int
main (int   argc,
      char *argv[])
{
#ifdef FLATTER_FAILURE
  return EXIT_FAILURE;
#else
  return EXIT_SUCCESS;
#endif
}

