import os
import json
import base64
from PIL import Image
from server import PromptServer
from aiohttp import web
import folder_paths
from nodes import LoadImage

# Save the original INPUT_TYPES method
original_input_types = LoadImage.INPUT_TYPES

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
        thumbnail_path = get_thumbnail_path(os.path.basename(file_path))
        img.save(thumbnail_path, "WEBP", quality=80)
        
        return thumbnail_path
    except Exception as e:
        print(f"Error creating thumbnail for {file_path}: {str(e)}")
        return None

@classmethod
def enhanced_input_types(cls):
    # Get the result of the original method
    original_result = original_input_types()
    original_files = original_result["required"]["image"][0]

    # Add files from subfolders
    input_dir = folder_paths.get_input_directory()
    exclude_folders = ["clipspace", "3d"]
    additional_files = []
    
    # Load existing tabs data
    tabs_data = load_tabs_data()
    folder_tabs = set(tabs_data["tabs"])
    
    for root, dirs, files in os.walk(input_dir, followlinks=True):
        # Skip the root directory as these files are already included
        if root == input_dir:
            continue
        rel_path = os.path.relpath(root, input_dir)
        parts = rel_path.split(os.sep)
        
        if any(part in exclude_folders for part in parts):
            continue
        # Exclude certain folders
        dirs[:] = [d for d in dirs if d not in exclude_folders]
        
        # Get folder name for tab
        rel_path = os.path.relpath(root, input_dir)
        folder_name = os.path.basename(rel_path)
        
        # Add folder as tab if it's not already there
        if folder_name and folder_name not in folder_tabs:
            tabs_data["tabs"].append(folder_name)
            folder_tabs.add(folder_name)

        for file in files:
            if not folder_paths.filter_files_content_types(files, ["image"]):
                continue
                
            file_path = os.path.join(root, file)
            rel_file_path = os.path.relpath(file_path, input_dir)
            rel_file_path = rel_file_path.replace("\\", "/")
            
            # Add file to list
            additional_files.append(rel_file_path)
            
            # Create thumbnail if it doesn't exist
            thumbnail_path = get_thumbnail_path(rel_file_path)
            if not os.path.exists(thumbnail_path):
                create_thumbnail(file_path)
            
            # Add image to folder tab
            if folder_name:
                if rel_file_path not in tabs_data["image_tabs"]:
                    tabs_data["image_tabs"][rel_file_path] = []
                
                if folder_name not in tabs_data["image_tabs"][rel_file_path]:
                    tabs_data["image_tabs"][rel_file_path].append(folder_name)

    # Save updated tabs data
    save_tabs_data(tabs_data)

    # Combine original files and files from subfolders
    combined_files = original_files + additional_files

    # Return the modified result
    original_result["required"]["image"] = (sorted(combined_files), original_result["required"]["image"][1])
    return original_result

# Replace the original method with our enhanced method
LoadImage.INPUT_TYPES = enhanced_input_types

try:
    from send2trash import send2trash
    USE_SEND2TRASH = True
except ImportError:
    USE_SEND2TRASH = False

@PromptServer.instance.routes.post("/delete_file")
async def delete_file(request):
    try:
        data = await request.json()
        filename = data.get('filename').replace("/", "\\")
        if not filename:
            return web.Response(status=400, text="Filename not provided")

        input_dir = folder_paths.get_input_directory()
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

@PromptServer.instance.routes.get("/get_thumbnail/{filename}")
async def get_thumbnail(request):
    try:
        filename = request.match_info['filename']
        thumbnail_path = get_thumbnail_path(filename)
        
        if not os.path.exists(thumbnail_path):
            # Try to create thumbnail on-the-fly if it doesn't exist
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
                # Try to create thumbnail on-the-fly
                file_path = os.path.join(input_dir, filename)
                if os.path.exists(file_path):
                    thumbnail_path = create_thumbnail(file_path)
            
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