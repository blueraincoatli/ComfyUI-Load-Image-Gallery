import os
import json
import base64
from io import BytesIO
from PIL import Image
from server import PromptServer
from aiohttp import web
from folder_paths import get_input_directory

try:
    from send2trash import send2trash
    USE_SEND2TRASH = True
except ImportError:
    USE_SEND2TRASH = False

# Path to the JSON file for storing tab data
TABS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "image_tabs.json")

# Path to the thumbnails directory
THUMBNAILS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "thumbnails")
if not os.path.exists(THUMBNAILS_DIR):
    os.makedirs(THUMBNAILS_DIR)

# Load tab data
def load_tabs_data():
    if os.path.exists(TABS_FILE):
        try:
            with open(TABS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading tabs data: {str(e)}")
    return {"tabs": [], "image_tabs": {}}

# Save tab data
def save_tabs_data(data):
    try:
        with open(TABS_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"Error saving tabs data: {str(e)}")
        return False

# Get safe filename for thumbnail
def get_thumbnail_path(filename):
    safe_filename = os.path.basename(filename).replace(" ", "_")
    return os.path.join(THUMBNAILS_DIR, f"{safe_filename}.webp")

@PromptServer.instance.routes.post("/delete_file")
async def delete_file(request):
    try:
        data = await request.json()
        filename = data.get('filename')
        if not filename:
            return web.Response(status=400, text="Filename not provided")

        input_dir = get_input_directory()
        file_path = os.path.join(input_dir, filename)

        if not os.path.exists(file_path):
            return web.Response(status=404, text="File not found")

        # Remove file from tabs
        tabs_data = load_tabs_data()
        if filename in tabs_data["image_tabs"]:
            del tabs_data["image_tabs"][filename]
            save_tabs_data(tabs_data)

        # Delete thumbnail if exists
        thumbnail_path = get_thumbnail_path(filename)
        if os.path.exists(thumbnail_path):
            os.remove(thumbnail_path)

        # Delete the file
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

@PromptServer.instance.routes.get("/get_image_tabs")
async def get_image_tabs(request):
    try:
        tabs_data = load_tabs_data()
        return web.json_response(tabs_data)
    except Exception as e:
        print(f"Error getting image tabs: {str(e)}")
        return web.Response(status=500, text="Internal server error")

@PromptServer.instance.routes.post("/save_image_tabs")
async def save_image_tabs(request):
    try:
        tabs_data = await request.json()
        if save_tabs_data(tabs_data):
            return web.Response(status=200, text="Tabs saved successfully")
        else:
            return web.Response(status=500, text="Failed to save tabs")
    except Exception as e:
        print(f"Error saving image tabs: {str(e)}")
        return web.Response(status=500, text="Internal server error")

@PromptServer.instance.routes.post("/add_image_to_tab")
async def add_image_to_tab(request):
    try:
        data = await request.json()
        filename = data.get('filename')
        tab_name = data.get('tab_name')
        
        if not filename or not tab_name:
            return web.Response(status=400, text="Filename or tab name not provided")
        
        tabs_data = load_tabs_data()
        
        # Check if the tab exists
        if tab_name not in tabs_data["tabs"]:
            tabs_data["tabs"].append(tab_name)
        
        # Add image to tab
        if filename not in tabs_data["image_tabs"]:
            tabs_data["image_tabs"][filename] = []
        
        if tab_name not in tabs_data["image_tabs"][filename]:
            tabs_data["image_tabs"][filename].append(tab_name)
        
        if save_tabs_data(tabs_data):
            return web.Response(status=200, text="Image added to tab successfully")
        else:
            return web.Response(status=500, text="Failed to save tabs")
    except Exception as e:
        print(f"Error adding image to tab: {str(e)}")
        return web.Response(status=500, text="Internal server error")

@PromptServer.instance.routes.post("/remove_image_from_tab")
async def remove_image_from_tab(request):
    try:
        data = await request.json()
        filename = data.get('filename')
        tab_name = data.get('tab_name')
        
        if not filename or not tab_name:
            return web.Response(status=400, text="Filename or tab name not provided")
        
        tabs_data = load_tabs_data()
        
        # Remove image from tab
        if filename in tabs_data["image_tabs"] and tab_name in tabs_data["image_tabs"][filename]:
            tabs_data["image_tabs"][filename].remove(tab_name)
            
            # If the image has no tabs left, remove it from the dictionary
            if not tabs_data["image_tabs"][filename]:
                del tabs_data["image_tabs"][filename]
        
        if save_tabs_data(tabs_data):
            return web.Response(status=200, text="Image removed from tab successfully")
        else:
            return web.Response(status=500, text="Failed to save tabs")
    except Exception as e:
        print(f"Error removing image from tab: {str(e)}")
        return web.Response(status=500, text="Internal server error")

@PromptServer.instance.routes.post("/save_thumbnail")
async def save_thumbnail(request):
    try:
        data = await request.json()
        filename = data.get('filename')
        image_data = data.get('data')
        
        if not filename or not image_data:
            return web.Response(status=400, text="Filename or image data not provided")
        
        # Extract base64 data
        if ',' in image_data:
            image_data = image_data.split(',')[1]
        
        # Decode base64 data
        image_bytes = base64.b64decode(image_data)
        
        # Open image
        img = Image.open(BytesIO(image_bytes))
        
        # Save as WebP with high compression
        thumbnail_path = get_thumbnail_path(filename)
        img.save(thumbnail_path, "WEBP", quality=80)
        
        return web.Response(status=200, text="Thumbnail saved successfully")
    except Exception as e:
        print(f"Error saving thumbnail: {str(e)}")
        return web.Response(status=500, text="Internal server error")
@PromptServer.instance.routes.post("/get_thumbnails_batch")
async def get_thumbnails_batch(request):
    try:
        data = await request.json()
        filenames = data.get('filenames', [])
        
        if not filenames:
            return web.Response(status=400, text="No filenames provided")
        
        result = {}
        for filename in filenames:
            thumbnail_path = get_thumbnail_path(filename)
            if os.path.exists(thumbnail_path):
                # Read the file and encode to base64
                with open(thumbnail_path, "rb") as f:
                    file_content = f.read()
                    base64_data = base64.b64encode(file_content).decode('utf-8')
                    result[filename] = f"data:image/webp;base64,{base64_data}"
        
        return web.json_response(result)
    except Exception as e:
        print(f"Error getting thumbnails batch: {str(e)}")
        return web.Response(status=500, text="Internal server error")
@PromptServer.instance.routes.get("/get_thumbnail/{filename}")
async def get_thumbnail(request):
    try:
        filename = request.match_info['filename']
        thumbnail_path = get_thumbnail_path(filename)
        
        if not os.path.exists(thumbnail_path):
            return web.Response(status=404, text="Thumbnail not found")
        
        return web.FileResponse(thumbnail_path)
    except Exception as e:
        print(f"Error getting thumbnail: {str(e)}")
        return web.Response(status=500, text="Internal server error")

@PromptServer.instance.routes.post("/cleanup_thumbnails")
async def cleanup_thumbnails(request):
    try:
        data = await request.json()
        active_files = data.get('active_files', [])
        
        if not active_files:
            return web.Response(status=400, text="No active files provided")
        
        # Get all thumbnails
        thumbnails = [f for f in os.listdir(THUMBNAILS_DIR) if f.endswith('.webp')]
        removed_count = 0
        
        # Check each thumbnail
        for thumbnail in thumbnails:
            original_filename = os.path.splitext(thumbnail)[0].replace("_", " ")
            if original_filename not in active_files:
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