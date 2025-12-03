#!/usr/bin/env python3
"""Create simple icon files for the Chrome extension."""

from PIL import Image, ImageDraw, ImageFont
import os

def create_icon(size, filename):
    """Create a simple icon with the size specified."""
    # Create a new image with a green background (eco theme)
    img = Image.new('RGB', (size, size), color='#2ecc71')
    draw = ImageDraw.Draw(img)

    # Draw a white circle
    margin = size // 8
    draw.ellipse([margin, margin, size-margin, size-margin],
                 fill='white', outline='#27ae60', width=max(1, size//32))

    # Draw a simple leaf shape (eco theme)
    center = size // 2
    leaf_size = size // 3
    draw.ellipse([center - leaf_size//2, center - leaf_size//2,
                  center + leaf_size//2, center + leaf_size//2],
                 fill='#2ecc71', outline='#27ae60', width=max(1, size//32))

    # Save the icon
    img.save(filename, 'PNG')
    print(f"Created {filename}")

# Create icons in the assets folder
assets_dir = 'assets'
if not os.path.exists(assets_dir):
    os.makedirs(assets_dir)

# Create icons for different sizes
create_icon(16, os.path.join(assets_dir, 'icon16.png'))
create_icon(48, os.path.join(assets_dir, 'icon48.png'))
create_icon(128, os.path.join(assets_dir, 'icon128.png'))

print("All icons created successfully!")
