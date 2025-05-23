import os
import base64
from PIL import Image
from server import PromptServer
from aiohttp import web
import folder_paths
from nodes import LoadImage

try:
    from nodes import LoadImageMask
    HAS_LOAD_IMAGE_MASK = True
except ImportError:
    HAS_LOAD_IMAGE_MASK = False

try:
    from nodes import LoadImageOutput
    HAS_LOAD_IMAGE_OUTPUT = True
except ImportError:
    HAS_LOAD_IMAGE_OUTPUT = False
    
# Save the original INPUT_TYPES method
original_input_types = {
    "LoadImage": LoadImage.INPUT_TYPES
}

if HAS_LOAD_IMAGE_MASK:
    original_input_types["LoadImageMask"] = LoadImageMask.INPUT_TYPES

if HAS_LOAD_IMAGE_OUTPUT:
    original_input_types["LoadImageOutput"] = LoadImageOutput.INPUT_TYPES

# Path to the thumbnails directory
THUMBNAILS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "thumbnails")
if not os.path.exists(THUMBNAILS_DIR):
    os.makedirs(THUMBNAILS_DIR)

# Get safe filename for thumbnail
def get_thumbnail_path(filename):
    safe_filename = filename.replace(os.sep, "__").replace("/", "__").replace("\\", "__").replace(" ", "_")
    return os.path.join(THUMBNAILS_DIR, f"{safe_filename}.webp")

# Create thumbnail from image file
def create_thumbnail(file_path, size=(80, 80)):
    try:
        img = Image.open(file_path)

        # Calculate aspect ratio
        width, height = img.size
        aspect_ratio = width / height

        # Crop to square from center
        if aspect_ratio > 1:
            new_width = height
            left = (width - new_width) // 2
            img = img.crop((left, 0, left + new_width, height))
        else:
            new_height = width
            top = (height - new_height) // 2
            img = img.crop((0, top, width, top + new_height))

        # Resize to thumbnail size
        img = img.resize(size, Image.LANCZOS)

        # Save as WebP
        thumbnail_path = get_thumbnail_path(file_path.replace(folder_paths.get_input_directory() + os.sep, ""))
        img.save(thumbnail_path, "WEBP", quality=80)

        return thumbnail_path
    except Exception as e:
        print(f"Error creating thumbnail for {file_path}: {str(e)}")
        return None

def get_enhanced_files():
    input_dir = folder_paths.get_input_directory()
    exclude_folders = ["clipspace", "3d"]
    additional_files = []

    for root, dirs, files in os.walk(input_dir, followlinks=True):
        if root == input_dir:
            continue
        rel_path = os.path.relpath(root, input_dir)
        parts = rel_path.split(os.sep)

        if any(part in exclude_folders for part in parts):
            continue
        dirs[:] = [d for d in dirs if d not in exclude_folders]

        for file in files:
            if not folder_paths.filter_files_content_types(files, ["image"]):
                continue

            file_path = os.path.join(root, file)
            rel_file_path = os.path.relpath(file_path, input_dir)

            additional_files.append(rel_file_path)

            thumbnail_path = get_thumbnail_path(rel_file_path)
            if not os.path.exists(thumbnail_path):
                create_thumbnail(file_path)

    return sorted(additional_files)

@classmethod
def enhanced_load_image_input_types(cls):
    original_result = original_input_types["LoadImage"]()
    original_files = original_result["required"]["image"][0]
    additional_files = get_enhanced_files()
    
    combined_files = original_files + additional_files
    original_result["required"]["image"] = (sorted(combined_files), original_result["required"]["image"][1])
    return original_result

LoadImage.INPUT_TYPES = enhanced_load_image_input_types

if HAS_LOAD_IMAGE_MASK:
    @classmethod
    def enhanced_load_image_mask_input_types(cls):
        original_result = original_input_types["LoadImageMask"]()
        if "required" in original_result and "image" in original_result["required"]:
            param_name = "image"
        elif "required" in original_result and "mask" in original_result["required"]:
            param_name = "mask"
        else:
            return original_result
        
        original_files = original_result["required"][param_name][0]
        additional_files = get_enhanced_files()
        
        if isinstance(original_files, list):
            combined_files = original_files + additional_files
            original_result["required"][param_name] = (sorted(combined_files), original_result["required"][param_name][1])
        
        return original_result
    
    LoadImageMask.INPUT_TYPES = enhanced_load_image_mask_input_types

if HAS_LOAD_IMAGE_OUTPUT:
    @classmethod
    def enhanced_load_image_output_input_types(cls):
        original_result = original_input_types["LoadImageOutput"]()
        if "required" in original_result and "image" in original_result["required"]:
            param_name = "image"
        else:
            return original_result
        
        original_files = original_result["required"][param_name][0]
        additional_files = get_enhanced_files()
        
        if isinstance(original_files, list):
            combined_files = original_files + additional_files
            original_result["required"][param_name] = (sorted(combined_files), original_result["required"][param_name][1])
        elif isinstance(original_files, str):
            print(f"Warning: original_files for {param_name} is a string, not a list")
            original_result["required"][param_name] = (original_files, original_result["required"][param_name][1])
        
        return original_result
    
    LoadImageOutput.INPUT_TYPES = enhanced_load_image_output_input_types


try:
    from send2trash import send2trash
    USE_SEND2TRASH = True
except ImportError:
    USE_SEND2TRASH = False

@PromptServer.instance.routes.post("/delete_file")
async def delete_file(request):
    try:
        data = await request.json()
        filename = os.path.normpath(data.get('filename'))
        if not filename:
            return web.Response(status=400, text="Filename not provided")

        input_dir = folder_paths.get_input_directory()
        file_path = os.path.join(input_dir, filename)

        if not os.path.exists(file_path):
            return web.Response(status=404, text="File not found")

        thumbnail_path = get_thumbnail_path(filename)
        if os.path.exists(thumbnail_path):
            os.remove(thumbnail_path)

        if USE_SEND2TRASH:
            send2trash(file_path)
            message = "File moved to trash successfully"
        else:
            os.remove(file_path)
            message = "File deleted successfully"

        return web.Response(status=200, text=message)
    except Exception as e:
        print(f"Error deleting file: {str(e)}")
        return web.Response(status=500, text="Internal server error")

@PromptServer.instance.routes.get("/get_thumbnail/{filename:.*}")
async def get_thumbnail(request):
    try:
        filename = request.match_info['filename']
        thumbnail_path = get_thumbnail_path(filename)

        if not os.path.exists(thumbnail_path):
            input_dir = folder_paths.get_input_directory()
            file_path = os.path.join(input_dir, filename)

            if os.path.exists(file_path):
                thumbnail_path = create_thumbnail(file_path)
                if not thumbnail_path:
                    return web.Response(status=404, text="Failed to create thumbnail")
            else:
                return web.Response(status=404, text="Image file not found")

        return web.FileResponse(thumbnail_path)
    except Exception as e:
        print(f"Error getting thumbnail: {str(e)}")
        return web.Response(status=500, text="Internal server error")

@PromptServer.instance.routes.post("/get_thumbnails_batch")
async def get_thumbnails_batch(request):
    try:
        data = await request.json()
        filenames = data.get('filenames', [])

        if not filenames:
            return web.Response(status=400, text="No filenames provided")

        result = {}
        input_dir = folder_paths.get_input_directory()

        for filename in filenames:
            thumbnail_path = get_thumbnail_path(filename)
            if not os.path.exists(thumbnail_path):
                file_path = os.path.join(input_dir, filename)
                if os.path.exists(file_path):
                    thumbnail_path = create_thumbnail(file_path)

            if os.path.exists(thumbnail_path):
                with open(thumbnail_path, "rb") as f:
                    file_content = f.read()
                    base64_data = base64.b64encode(file_content).decode('utf-8')
                    result[filename] = f"data:image/webp;base64,{base64_data}"

        return web.json_response(result)
    except Exception as e:
        print(f"Error getting thumbnails batch: {str(e)}")
        return web.Response(status=500, text="Internal server error")

@PromptServer.instance.routes.post("/cleanup_thumbnails")
async def cleanup_thumbnails(request):
    try:
        data = await request.json()
        active_files = data.get('active_files', [])

        if not active_files:
            return web.Response(status=400, text="No active files provided")

        thumbnails = [f for f in os.listdir(THUMBNAILS_DIR) if f.endswith('.webp')]
        removed_count = 0

        active_thumbnails = [get_thumbnail_path(f).split(os.sep)[-1] for f in active_files]

        for thumbnail in thumbnails:
            if thumbnail not in active_thumbnails:
                os.remove(os.path.join(THUMBNAILS_DIR, thumbnail))
                removed_count += 1

        return web.Response(status=200, text=f"Removed {removed_count} stale thumbnails")
    except Exception as e:
        print(f"Error cleaning up thumbnails: {str(e)}")
        return web.Response(status=500, text="Internal server error")

@PromptServer.instance.routes.get("/check_thumbnails_service")
async def check_thumbnails_service(request):
    try:
        if os.path.exists(THUMBNAILS_DIR):
            return web.Response(status=200, text="Thumbnails service is available")
        else:
            try:
                os.makedirs(THUMBNAILS_DIR)
                return web.Response(status=200, text="Thumbnails directory created")
            except:
                return web.Response(status=500, text="Could not create thumbnails directory")
    except Exception as e:
        print(f"Error checking thumbnails service: {str(e)}")
        return web.Response(status=500, text="Internal server error")

NODE_CLASS_MAPPINGS = {}
WEB_DIRECTORY = "./js"
__all__ = ['NODE_CLASS_MAPPINGS', 'WEB_DIRECTORY']