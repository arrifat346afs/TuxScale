import { useState } from 'react'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarProvider,
  SidebarTrigger
} from './ui/sidebar'
import { Button } from './ui/button'
import { Label } from './ui/label'
import { Switch } from './ui/switch'
import { Slider } from './ui/slider'
import { Tabs, TabsList, TabsTrigger } from './ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { FileVideo, Folder, HelpCircle, Rocket, Layers } from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const SaideBar = () => {
  const [activeTab, setActiveTab] = useState('upscale')
  const [batchMode, setBatchMode] = useState(false)
  const [doubleUpscale, setDoubleUpscale] = useState(false)
  const [model, setModel] = useState('lite')
  const [scale, setScale] = useState([4])

  return (
    <SidebarProvider>
      <div className="flex min-h-svh w-full">
        <Sidebar>
          <SidebarContent className="flex flex-col gap-5 p-4">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="mx-auto grid w-fit grid-cols-2 rounded-full p-1">
                <TabsTrigger value="upscale" className="rounded-full">
                  Upscale
                </TabsTrigger>
                <TabsTrigger value="settings" className="rounded-full">
                  Settings
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex items-center gap-2">
              <Switch id="batch-mode" checked={batchMode} onCheckedChange={setBatchMode} />
              <Label htmlFor="batch-mode" className="cursor-pointer">
                Batch Upscale
              </Label>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Step 1</h3>
              <Button variant="secondary" className="w-full rounded-full">
                <FileVideo />
                Select Video
              </Button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Step 2</h3>
                <p className="text-xs text-muted-foreground">Select AI Model</p>
              </div>

              <Select value={model} onValueChange={setModel}>
                <SelectTrigger className="w-full rounded-full">
                  <Layers className="size-4" />
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lite">VideoUp Lite</SelectItem>
                  <SelectItem value="pro">VideoUp Pro</SelectItem>
                  <SelectItem value="realesrgan">Real-ESRGAN</SelectItem>
                  <SelectItem value="anime">Anime 4K</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2">
                <Switch
                  id="double-upscale"
                  checked={doubleUpscale}
                  onCheckedChange={setDoubleUpscale}
                />
                <Label htmlFor="double-upscale" className="cursor-pointer">
                  Double Upscale
                </Label>
                <HelpCircle className="size-4 text-muted-foreground" />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Video Scale ({scale[0]}x)</Label>
                <Slider value={scale} onValueChange={setScale} min={1} max={4} step={1} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Step 3</h3>
                <p className="text-xs text-muted-foreground">Defaults to Video&apos;s path</p>
              </div>
              <Button variant="secondary" className="w-full rounded-full">
                <Folder />
                Set Output Folder
              </Button>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Step 4</h3>
              <Button className="w-full rounded-full bg-violet-600 hover:bg-violet-700">
                <Rocket />
                Upscale
              </Button>
            </div>
          </SidebarContent>
          <SidebarFooter className="p-4">
            <SidebarTrigger />
          </SidebarFooter>
        </Sidebar>
        <main className="flex flex-1 flex-col p-6">Main content area</main>
      </div>
    </SidebarProvider>
  )
}

export default SaideBar
