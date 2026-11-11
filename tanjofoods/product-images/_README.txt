TANJO FOODS - PRODUCT PHOTO FOLDER
==================================

Put product photos in this folder, named by the product SKU:

    TF-SN-001.jpg      <- main photo for SKU TF-SN-001
    TF-SN-001_2.jpg    <- second photo
    TF-SN-001_3.png    <- third photo

- Allowed: .jpg .jpeg .png .webp   (square, white/clean background, min. 1000 px works best)
- The SKU must match exactly (see Admin > Products). Letter case doesn't matter.
- New / replaced photos show on the shop within 30 seconds,
  or immediately with Admin > Products > "Scan photo folder".
- Photos uploaded in Admin are saved here with the same naming.
- Photos deleted in Admin are moved to the _deleted sub-folder (not destroyed).
- Files that don't match a SKU are listed when you click "Scan photo folder".

To use a different folder, set PRODUCT_IMAGE_DIR in api\.env
