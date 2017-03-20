import os, os.path
import random
import string

import cherrypy
import requests
#from requests.auth import HTTPDigestAuth

import time
import xmltodict
import json

class TiVoConnectGenerator(object):
   exposed = True
   @cherrypy.tools.accept(media='text/plain')
   def GET(self, *args, **kwargs):
      print cherrypy.request.base
      print cherrypy.request.query_string
      print cherrypy.request.request_line
      print cherrypy.request.params
      print args['uri']
      
      url = args['uri']
      #url = 'https://172.16.1.6/TiVoConnect?'+cherrypy.request.query_string
      r=requests.get(url, auth=requests.auth.HTTPDigestAuth('tivo', '8446597272'), verify=False )

      #mdo= xmltodict.parse(r.text)
      #print mdo
      
      #j=json.dumps(mdo)
      print r.text
      
      return r.text


class ProxyGenerator(object):
   exposed = True
   @cherrypy.tools.accept(media='text/plain')
   def GET(self, user, password, uri):
      print cherrypy.request.base
      print cherrypy.request.query_string
      print cherrypy.request.request_line
      print cherrypy.request.params
      print uri
      
      url = uri
      #url = 'https://172.16.1.6/TiVoConnect?'+cherrypy.request.query_string
      r=requests.get(url, auth=requests.auth.HTTPDigestAuth(user, password), verify=False )

      #mdo= xmltodict.parse(r.text)
      #print mdo
      
      #j=json.dumps(mdo)
      print r.text
      
      return r.text

   
class HelloWorld(object):
   @cherrypy.expose
   def index(self):
       open('')


if __name__ == '__main__':
    conf = {
	    '/': {
	        'request.dispatch': cherrypy.dispatch.MethodDispatcher(),
	        'tools.response_headers.on': True,
	        'tools.response_headers.headers': [('Content-Type', 'text/plain')],
	    }
    }

    confStatic = {
	    '/': {
	        'tools.staticdir.on': True,
	        'tools.staticdir.dir': os.path.abspath(os.getcwd()),
                'tools.staticdir.index' :  'flashls/examples/chromeless/native-ttg.html'          
	    }
    }    

    cherrypy.server.socket_host =  '0.0.0.0'

    cherrypy.tree.mount( ProxyGenerator(),'/Proxy',  config=conf )
    #cherrypy.tree.mount( TiVoConnectGenerator(),'/TiVoConnect',  config=conf )
    cherrypy.quickstart( HelloWorld(), '/', confStatic )
    
    
